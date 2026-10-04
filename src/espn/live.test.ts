import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fmt, snapshotAt } from '../model/derive';
import type { EventKind, PlayEvent, Pos, Slate } from '../model/types';
import { buildSlate, posOf } from './slate';
import { scoresAgainst, yardsAgainst } from './summary';
import { buildTimeline } from './timeline';
import {
  actualOf,
  benchPointsOf,
  decompose,
  describeAdjust,
  describeLive,
  describeNote,
  dstTiers,
  eventsFromPoll,
  readPoll,
  tierPoints,
  withBenchPoints,
  withEvents,
  type Actual,
  type DstHistory,
  type Piece,
} from './live';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

const league = fixture('week3-pregame.json');
const season = fixture('season-2026-proteams.json');
const liveMatchup = fixture('matchup-week3-live-1047.json');
const liveMatchup1141 = fixture('matchup-week3-live-1141.json');
const summaryFixture = fixture('summary-401872950-live.json');
const TZ = 'America/New_York';
const WEEK = 3;
const NOW_MS = 1790528400000;

const playersOf = (teamId: number): any[] => {
  const matchup = league.schedule.find(
    (m: any) => m.home.teamId === teamId || m.away.teamId === teamId,
  );
  return [matchup.home, matchup.away].flatMap((side: any) =>
    (side.rosterForCurrentScoringPeriod?.entries ?? []).map((e: any) => e.playerPoolEntry.player),
  );
};

const playerNamed = (name: string): any => playersOf(6).concat(playersOf(3), playersOf(11), playersOf(14)).find(p => p.fullName === name);
const actualNamed = (name: string): Actual => actualOf(playerNamed(name), WEEK)!;

const slateOf = (teamId: number): Slate =>
  buildSlate(
    { ...league, scoringPeriodId: WEEK, schedule: league.schedule },
    season,
    teamId,
    { timeZone: TZ },
  );

const kickoffsOf = (week: number): number[] => {
  const dates: number[] = [];
  for (const team of season.settings.proTeams) {
    for (const game of team.proGamesByScoringPeriod?.[String(week)] ?? []) dates.push(game.date);
  }
  return dates;
};
const toNow = buildTimeline(kickoffsOf(WEEK), TZ).toT(NOW_MS);

const shown = (pieces: Piece[]): string =>
  pieces.map(p => `${p.kind} ${p.yds} ${p.pts}`).join(', ');
const sumOf = (pieces: Piece[]): number =>
  Math.round(pieces.reduce((total, p) => total + p.pts, 0) * 100) / 100;

describe('actualOf', () => {
  it('reads the league-scored actual for the current week', () => {
    const love = actualNamed('Jordan Love');

    expect(love.total).toBe(18.48);
    expect(love.stats['3']).toBe(312);
    expect(love.stats['4']).toBe(2);
    expect(love.applied['20']).toBe(-2);
  });

  it('returns null for a player with no actual entry', () => {
    expect(actualOf(playerNamed('Jared Goff'), WEEK)).toBeNull();
    expect(actualOf({ fullName: 'Nobody' }, WEEK)).toBeNull();
    expect(actualOf(null, WEEK)).toBeNull();
  });

  it('treats a missing stats or appliedStats map as empty', () => {
    const partial = {
      stats: [
        { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: WEEK, appliedTotal: 2.5, stats: { 24: 10 } },
        { statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 2, appliedTotal: 99, appliedStats: { 24: 9 } },
      ],
    };

    expect(actualOf(partial, WEEK)).toEqual({ total: 2.5, stats: { '24': 10 }, applied: {} });
  });
});

describe('decompose', () => {
  it('spreads Love’s passing yardage around his two touchdowns and his pick', () => {
    const pieces = decompose('QB', null, actualNamed('Jordan Love'));

    expect(shown(pieces)).toBe(
      [
        'pass 39 1.56', 'pass 39 1.56', 'passTD 0 4', 'pass 39 1.56', 'pass 39 1.56',
        'passTD 0 4', 'pass 39 1.56', 'pass 39 1.56', 'int 0 -2', 'pass 39 1.56', 'pass 39 1.56',
      ].join(', '),
    );
    expect(pieces).toHaveLength(11);
    expect(sumOf(pieces)).toBe(18.48);
  });

  it('puts Golden’s receiving touchdown in the middle of his catches', () => {
    const pieces = decompose('WR', null, actualNamed('Matthew Golden'));

    expect(shown(pieces)).toBe(
      [
        'catch 20 2.5', 'catch 20 2.5', 'recTD 0 6', 'catch 20 2.5', 'catch 20 2.5', 'catch 20 2.5',
      ].join(', '),
    );
    expect(pieces).toHaveLength(6);
    expect(sumOf(pieces)).toBe(18.5);
  });

  it('splits Kraft’s two short catches', () => {
    const pieces = decompose('TE', null, actualNamed('Tucker Kraft'));

    expect(shown(pieces)).toBe(
      [
        'catch 7 1.15', 'catch 7 1.15', 'catch 6 1.15', 'catch 6 1.15',
      ].join(', '),
    );
    expect(sumOf(pieces)).toBe(4.6);
  });

  it('runs Bijan Robinson’s rushes around his two rushing scores and adds his catch', () => {
    const pieces = decompose('RB', null, actualNamed('Bijan Robinson'));

    expect(shown(pieces)).toBe(
      [
        'rush 25 2.43', 'rush 25 2.43', 'rush 24 2.43', 'rushTD 0 6', 'rush 24 2.43',
        'rush 24 2.43', 'rush 24 2.43', 'rushTD 0 6', 'rush 24 2.43', 'rush 24 2.39',
        'catch 10 1.45', 'catch 9 1.45',
      ].join(', '),
    );
    expect(pieces).toHaveLength(12);
    expect(sumOf(pieces)).toBe(34.3);
  });

  it('lands an unknown stat on the last piece', () => {
    const pieces = decompose('WR', null, actualNamed('Drake London'));
    const yards = pieces.map(p => p.yds).join('/');
    const points = pieces.map(p => p.pts).join('/');

    expect(pieces).toHaveLength(9);
    expect(pieces[4]).toMatchObject({ kind: 'rush', note: 'tackle' });
    expect(pieces.every((p, i) => (i === 4 ? true : p.kind === 'catch'))).toBe(true);
    expect(yards).toBe('25/25/24/24/0/24/24/24/24');
    expect(points).toBe('2.99/2.99/2.99/2.99/0.75/2.99/2.99/2.99/2.97');
    expect(sumOf(pieces)).toBe(24.65);
  });

  it('works on the delta between two polls', () => {
    const prev: Actual = { total: 12.0, stats: { '3': 200, '4': 1 }, applied: { '3': 8.0, '4': 4.0 } };
    const pieces = decompose('QB', prev, actualNamed('Jordan Love'));

    expect(shown(pieces)).toBe(
      [
        'pass 14 0.56', 'pass 14 0.56', 'pass 14 0.56', 'pass 14 0.56', 'pass 14 0.56',
        'pass 14 0.56', 'pass 14 0.56', 'pass 14 0.56', 'passTD 0 4', 'int 0 -2',
      ].join(', '),
    );
    expect(pieces).toHaveLength(10);
    expect(sumOf(pieces)).toBe(6.48);
  });

  it('returns nothing when nothing changed', () => {
    const love = actualNamed('Jordan Love');

    expect(decompose('QB', love, love)).toEqual([]);
    expect(decompose('QB', null, love).length).toBeGreaterThan(0);
  });

  it('falls back to one piece by position when no stat is counted', () => {
    const bare: Actual = { total: 3, stats: {}, applied: { '999': 3 } };
    const kinds: Record<string, EventKind> = {
      QB: 'pass',
      RB: 'rush',
      WR: 'catch',
      TE: 'catch',
      K: 'xp',
    };

    for (const pos of Object.keys(kinds) as Pos[]) {
      expect(decompose(pos, null, bare)).toEqual([{ kind: kinds[pos], yds: 0, pts: 3 }]);
    }
    for (const pos of ['DST', 'DP'] as Pos[]) {
      expect(decompose(pos, null, bare)).toEqual([{ kind: 'rush', yds: 0, pts: 3, adjust: true }]);
    }
    expect(decompose('DST', null, { total: 0, stats: {}, applied: {} })).toEqual([]);
  });

  it('uses catch pieces of zero yards when only receptions counted', () => {
    const pieces = decompose('WR', null, { total: 2.5, stats: { 53: 3 }, applied: { 53: 2.5 } });

    expect(pieces).toEqual([
      { kind: 'catch', yds: 0, pts: 0.83 },
      { kind: 'catch', yds: 0, pts: 0.83 },
      { kind: 'catch', yds: 0, pts: 0.84 },
    ]);
  });

  it('keeps the piece points summing to the delta total', () => {
    for (const [name, pos] of [
      ['Jordan Love', 'QB'],
      ['Matthew Golden', 'WR'],
      ['Tucker Kraft', 'TE'],
      ['Bijan Robinson', 'RB'],
      ['Drake London', 'WR'],
    ] as const) {
      const cur = actualNamed(name);
      expect(sumOf(decompose(pos, null, cur))).toBe(cur.total);
    }
  });
});

describe('describeLive', () => {
  it('writes one line per kind', () => {
    expect(describeLive('pass', 'Love', 12)).toBe('Love completes 12 yds');
    expect(describeLive('passTD', 'Love', 0)).toBe('Love throws a TD!');
    expect(describeLive('int', 'Love', 0)).toBe('Love throws a pick');
    expect(describeLive('rush', 'Henry', 7)).toBe('Henry runs for 7 yds');
    expect(describeLive('rushTD', 'Henry', 0)).toBe('Henry punches it in. TD!');
    expect(describeLive('catch', 'Adams', 22)).toBe('Adams hauls in 22 yds');
    expect(describeLive('recTD', 'Adams', 0)).toBe('Adams catches a TD!');
    expect(describeLive('fumble', 'Goff', 0)).toBe('Goff fumbles it away');
    expect(describeLive('fg', 'Aubrey', 0)).toBe('Aubrey drills a field goal');
    expect(describeLive('xp', 'Aubrey', 0)).toBe('Aubrey extra point is good');
    expect(describeLive('sack', 'Warner', 0)).toBe('Warner bring the heat');
    expect(describeLive('dint', 'Warner', 0)).toBe('Warner pick one off');
    expect(describeLive('fumrec', 'Warner', 0)).toBe('Warner recover a fumble');
    expect(describeLive('dtd', 'Warner', 0)).toBe('Warner defensive TD!');
    expect(describeLive('injury', 'Lloyd', 0)).toBe('Lloyd ruled OUT');
  });

  it('drops the yardage when a yardage kind has none', () => {
    expect(describeLive('pass', 'Love', 0)).toBe('Love completes a pass');
    expect(describeLive('rush', 'Henry', 0)).toBe('Henry runs it');
    expect(describeLive('catch', 'Adams', 0)).toBe('Adams hauls one in');
  });
});

describe('readPoll', () => {
  it('reads the starters of both sides of the team’s matchup', () => {
    const poll = readPoll(league.schedule, 6, WEEK);

    expect(Object.keys(poll.actuals).sort()).toEqual(
      [
        String(playerNamed('Jordan Love').id),
        String(playerNamed('Matthew Golden').id),
        String(playerNamed('Tucker Kraft').id),
      ].sort(),
    );
    expect(poll.actuals[String(playerNamed('Jordan Love').id)].total).toBe(18.48);
    expect(poll.out).toEqual([]);
  });

  it('leaves the bench out of the actuals and lists the ruled-out starters', () => {
    const poll = readPoll(league.schedule, 14, WEEK);
    const london = playerNamed('Drake London');

    expect(Object.keys(poll.actuals)).toEqual([String(london.id)]);
    expect(poll.actuals[String(london.id)].total).toBe(24.65);
    expect(poll.out).toEqual([String(playerNamed('Devin Lloyd').id)]);
  });

  it('throws for a team with no matchup', () => {
    expect(() => readPoll(league.schedule, 4, WEEK)).toThrow('no matchup for team 4');
  });
});

describe('bench points', () => {
  const schedule = liveMatchup1141.schedule;
  const benchPts = benchPointsOf(schedule, 1, WEEK);
  const named = (pts: Record<string, number>, slate: Slate) =>
    [...slate.bench!.me, ...slate.bench!.opp]
      .filter(seat => seat.player.id in pts)
      .map(seat => `${seat.player.last} ${pts[seat.player.id]}`);

  it('reads the scored bench of both sides and nothing from the lineup or IR', () => {
    const slate = slateOf(1);
    const starters = new Set(slate.lanes.flatMap(l => [l.me.id, l.opp.id]));

    expect(Object.keys(benchPts).some(id => starters.has(id))).toBe(false);
    expect(benchPts['4426385']).toBeUndefined(); // Charbonnet, on IR
    expect(named(benchPts, slate)).toEqual(['Stroud 6.6', 'Pittman Jr. 2.6', 'Mitchell 0', 'Herbert 8.7', 'Dowdle 0', 'Lloyd 2.8', 'Fields 1.4']);
  });

  it('puts the points on the matching seats and leaves the unscored ones empty', () => {
    const slate = withBenchPoints(slateOf(1), benchPts);

    expect(slate.bench!.me.map(seat => seat.pts)).toEqual([6.6, 2.6, undefined, 0, undefined]);
    expect(slate.bench!.opp.find(seat => seat.player.last === 'Herbert')!.pts).toBe(8.7);
  });
});

describe('eventsFromPoll for the first observation', () => {
  const slate = slateOf(6);
  const events = eventsFromPoll(slate, null, readPoll(league.schedule, 6, WEEK), toNow, 1);
  const events14 = eventsFromPoll(slateOf(14), null, readPoll(league.schedule, 14, WEEK), toNow, 1);

  it('seeds one event per piece, numbered from firstId', () => {
    expect(events).toHaveLength(21);
    expect(events.map(e => e.id)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  });

  it('times the pieces across the part of the window already played', () => {
    const love = slate.lanes.find(l => l.me.last === 'Love')!;
    const [w0, w1] = love.me.window;
    const loveEvents = events.filter(e => e.side === 'me' && e.lane === slate.lanes.indexOf(love));

    expect(loveEvents).toHaveLength(11);
    expect(loveEvents.every(e => e.t >= w0 && e.t <= Math.min(toNow, w1))).toBe(true);
    expect(Number(events[0].t.toFixed(6))).toBe(0.016746);
    expect(events[0]).toMatchObject({ lane: slate.lanes.indexOf(love), kind: 'pass', yds: 39, pts: 1.56 });
    expect(events[0].t).toBeCloseTo(0.200957 * (1 / 12), 6);
  });

  it('is sorted by time and keeps every event on the side it belongs to', () => {
    const times = events.map(e => e.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect([...new Set(events.map(e => e.side))]).toEqual(['me']);
  });

  it('labels every event with the player’s name', () => {
    const lastOf = (lane: number, side: 'me' | 'opp') => slate.lanes[lane][side].last;

    expect(events.every(e => e.text.startsWith(lastOf(e.lane, e.side)))).toBe(true);
    expect(events[0].text).toBe('Love completes 39 yds');
  });

  it('opens a game with the points ESPN reports for the side', () => {
    expect(fmt(snapshotAt(withEvents(slate, events), toNow).totals.me)).toBe('41.6');
    expect(fmt(snapshotAt(withEvents(slate, events), toNow).totals.opp)).toBe('0.0');
  });

  it('seeds a ruled-out starter with one injury event at his kickoff', () => {
    const slate14 = slateOf(14);
    const injuries = events14.filter(e => e.kind === 'injury');

    expect(injuries).toHaveLength(1);
    const [injury] = injuries;
    expect(injury.text).toBe('Lloyd ruled OUT');
    expect(injury.pts).toBe(0);
    expect(injury.yds).toBe(0);
    expect(injury.t).toBe(slate14.lanes[injury.lane][injury.side].window[0]);
    expect(events14).toHaveLength(10);
    expect(events14.filter(e => e.side === 'me')).toEqual(injuries);
  });
});

describe('eventsFromPoll for a later poll', () => {
  const slate = slateOf(6);
  const poll = readPoll(league.schedule, 6, WEEK);
  const seed = eventsFromPoll(slate, null, poll, toNow, 1);

  it('places the new pieces just after the current time', () => {
    const events = eventsFromPoll(slate, poll, poll, toNow, 22);

    expect(events).toEqual([]);
  });

  it('emits the delta since the last poll', () => {
    const loveId = String(playerNamed('Jordan Love').id);
    const next = {
      actuals: {
        ...poll.actuals,
        [loveId]: {
          total: 19.68,
          stats: { ...poll.actuals[loveId].stats, '3': 342 },
          applied: { ...poll.actuals[loveId].applied, '3': 13.68 },
        },
      },
      out: [],
    };
    const events = eventsFromPoll(slate, poll, next, toNow, 22);

    expect(events).toHaveLength(1);
    expect(events.map(e => e.id)).toEqual([22]);
    expect(events.map(e => [e.kind, e.yds, e.pts])).toEqual([
      ['pass', 30, 1.2],
    ]);
    expect(events.every(e => e.t > toNow)).toBe(true);
    expect(events[0].text).toBe('Love completes 30 yds');
  });

  it('reports a starter ruled out since the last poll at the current time', () => {
    const kraftId = String(playerNamed('Tucker Kraft').id);
    const next = { actuals: poll.actuals, out: [kraftId] };
    const events = eventsFromPoll(slate, poll, next, toNow, 22);
    const kraft = slate.lanes.find(l => l.me.id === kraftId || l.opp.id === kraftId)!;
    const side = kraft.me.id === kraftId ? 'me' : 'opp';

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'injury',
      pts: 0,
      yds: 0,
      side,
      lane: slate.lanes.indexOf(kraft),
      text: 'Kraft ruled OUT',
    });
    expect(events[0].t).toBe(Math.max(toNow, kraft[side].window[0]));
  });
});

describe('withEvents', () => {
  const slate = slateOf(6);

  it('merges by time and keeps the ids and every other field', () => {
    const seed = eventsFromPoll(slate, null, readPoll(league.schedule, 6, WEEK), toNow, 1);
    const late: PlayEvent = {
      id: 500,
      t: 0.9,
      side: 'opp',
      lane: 0,
      kind: 'fg',
      yds: 0,
      pts: 3,
      text: 'Fairbairn drills a field goal',
    };
    const merged = withEvents(withEvents(slate, seed), [late]);

    expect(merged.events).toHaveLength(22);
    expect(merged.events[21]).toBe(late);
    expect(merged.events.slice(0, 21)).toEqual(seed);
    expect(merged.events.map(e => e.id)).toEqual([...seed.map(e => e.id), 500]);
    expect(merged.lanes).toBe(slate.lanes);
    expect(merged.me).toBe(slate.me);
    expect(merged.opp).toBe(slate.opp);
    expect(merged.teamColors).toBe(slate.teamColors);
    expect(merged.axis).toBe(slate.axis);
    expect(merged.clockLabel).toBe(slate.clockLabel);
    expect(merged.statusLabel).toBe(slate.statusLabel);
    expect(slate.events).toEqual([]);
  });

  it('sorts a late-appended earlier event into place', () => {
    const first: PlayEvent = { id: 2, t: 0.5, side: 'me', lane: 0, kind: 'pass', yds: 5, pts: 0.4, text: 'Love completes 5 yds' };
    const second: PlayEvent = { id: 3, t: 0.2, side: 'me', lane: 0, kind: 'rush', yds: 5, pts: 0.4, text: 'Gibbs runs for 5 yds' };
    const merged = withEvents(withEvents(slate, [first]), [second]);

    expect(merged.events.map(e => [e.id, e.t])).toEqual([[3, 0.2], [2, 0.5]]);
  });
});

describe('decompose for defense', () => {
  it('reports points allowed on its own piece when nothing else counted', () => {
    expect(decompose('DST', null, { total: -3, stats: {}, applied: { '124': -3 } })).toEqual([
      { kind: 'rush', yds: 0, pts: -3, adjust: true },
    ]);
  });

  it('keeps a sack’s own points and reports the allowed points separately', () => {
    const pieces = decompose('DST', null, { total: -2, stats: { '99': 1 }, applied: { '99': 1, '124': -3 } });

    expect(pieces).toEqual([
      { kind: 'sack', yds: 0, pts: 1 },
      { kind: 'rush', yds: 0, pts: -3, adjust: true },
    ]);
    expect(sumOf(pieces)).toBe(-2);
  });

  it('spreads defense yardage pieces ahead of the adjustment', () => {
    const pieces = decompose('DP', null, { total: 2.5, stats: { '99': 2 }, applied: { '99': 2, '124': 0.5 } });

    expect(pieces).toEqual([
      { kind: 'sack', yds: 0, pts: 1 },
      { kind: 'sack', yds: 0, pts: 1 },
      { kind: 'rush', yds: 0, pts: 0.5, adjust: true },
    ]);
  });

  it('leaves offense bonuses folded into the last piece', () => {
    const pieces = decompose('WR', null, { total: 3.3, stats: { '42': 30 }, applied: { '42': 3, '999': 0.3 } });
    const last = pieces[pieces.length - 1];

    expect(pieces).toHaveLength(1);
    expect(last.kind).toBe('catch');
    expect(last.pts).toBe(3.3);
    expect(last.adjust).toBeUndefined();
    expect(pieces.some(p => p.adjust !== undefined)).toBe(false);
    expect(sumOf(pieces)).toBe(3.3);
  });
});

describe('describeNote', () => {
  it('writes one line per note', () => {
    expect(describeNote('tackle', 'Warner')).toBe('Warner makes a tackle');
    expect(describeNote('assist', 'Warner')).toBe('Warner assists on a tackle');
    expect(describeNote('stuff', 'Warner')).toBe('Warner stuffs the runner');
    expect(describeNote('pd', 'Warner')).toBe('Warner breaks up a pass');
    expect(describeNote('ff', 'Warner')).toBe('Warner forces a fumble');
    expect(describeNote('missFG', 'Aubrey')).toBe('Aubrey misses a field goal');
    expect(describeNote('missXP', 'Aubrey')).toBe('Aubrey misses the extra point');
    expect(describeNote('twoPt', 'Love')).toBe('Love converts the two-point try');
    expect(describeNote('fumTD', 'Adams')).toBe('Adams scoops it in for a TD!');
  });
});

describe('decompose for the 11:41 live capture', () => {
  const playerFrom1141 = (name: string): any =>
    liveMatchup1141.schedule
      .flatMap((m: any) => [m.home, m.away])
      .flatMap((side: any) => side.rosterForCurrentScoringPeriod.entries)
      .map((e: any) => e.playerPoolEntry.player)
      .find((p: any) => p.fullName === name);
  const piecesFor = (name: string): Piece[] => {
    const player = playerFrom1141(name);
    return decompose(posOf(player.defaultPositionId), null, actualOf(player, WEEK)!);
  };
  const tagged = (pieces: Piece[]): string[] =>
    pieces.map(p => `${p.kind} ${p.yds} ${p.pts}${p.note ? ` ${p.note}` : ''}`);

  it('gives Greg Rousseau his own tackle and assist pieces', () => {
    expect(tagged(piecesFor('Greg Rousseau'))).toEqual([
      'sack 0 2.5',
      'rush 0 0.75 tackle', 'rush 0 0.75 tackle', 'rush 0 0.75 tackle', 'rush 0 0.75 tackle',
      'rush 0 0.1 assist',
    ]);
    expect(sumOf(piecesFor('Greg Rousseau'))).toBe(5.6);
  });

  it('gives Will Anderson Jr. his forced fumble as a fumble-recovery piece', () => {
    expect(tagged(piecesFor('Will Anderson Jr.'))).toEqual([
      'sack 0 2.5', 'fumrec 0 3', 'rush 0 0.75 tackle', 'rush 0 0.1 assist', 'fumrec 0 2 ff',
    ]);
    expect(sumOf(piecesFor('Will Anderson Jr.'))).toBe(8.35);
  });

  it('spreads Jordyn Brooks’ five assisted tackles', () => {
    expect(tagged(piecesFor('Jordyn Brooks'))).toEqual([
      'rush 0 0.75 tackle',
      'rush 0 0.1 assist', 'rush 0 0.1 assist', 'rush 0 0.1 assist', 'rush 0 0.1 assist', 'rush 0 0.1 assist',
    ]);
    expect(sumOf(piecesFor('Jordyn Brooks'))).toBe(1.25);
  });

  it('lands DJ Moore’s solo tackle as its own piece', () => {
    expect(tagged(piecesFor('DJ Moore'))).toEqual([
      'catch 10 1.48', 'catch 10 1.48', 'rush 0 0.75 tackle', 'catch 10 1.48', 'catch 9 1.46',
    ]);
    expect(sumOf(piecesFor('DJ Moore'))).toBe(6.65);
  });

  it('counts a 50-yard field goal once, as both 74 and 198 report it', () => {
    const pieces = piecesFor('Evan McPherson');

    expect(tagged(pieces)).toEqual(['fg 0 4', 'xp 0 1', 'xp 0 1']);
    expect(pieces.filter(p => p.kind === 'fg')).toHaveLength(1);
    expect(sumOf(pieces)).toBe(6);
  });

  it('gives a missed field goal its own negative piece', () => {
    expect(tagged(piecesFor('Cam Little'))).toEqual([
      'xp 0 1', 'xp 0 1', 'rush 0 -1 missFG',
    ]);
    expect(sumOf(piecesFor('Cam Little'))).toBe(1);
  });

  it('counts a made short field goal and a miss for the same kicker', () => {
    expect(tagged(piecesFor('Cameron Dicker'))).toEqual([
      'fg 0 3', 'xp 0 1', 'rush 0 -1 missFG',
    ]);
    expect(sumOf(piecesFor('Cameron Dicker'))).toBe(3);
  });

  it('makes a two-point try the position’s own kind', () => {
    const two = { total: 2, stats: { '19': 1 }, applied: { '19': 2 } };

    expect(decompose('QB', null, two)).toEqual([{ kind: 'pass', yds: 0, pts: 2, note: 'twoPt' }]);
    expect(decompose('RB', null, { total: 2, stats: { '26': 1 }, applied: { '26': 2 } })).toEqual([
      { kind: 'rush', yds: 0, pts: 2, note: 'twoPt' },
    ]);
    expect(decompose('TE', null, { total: 2, stats: { '44': 1 }, applied: { '44': 2 } })).toEqual([
      { kind: 'catch', yds: 0, pts: 2, note: 'twoPt' },
    ]);
    expect(decompose('K', null, { total: 2, stats: { '19': 1 }, applied: { '19': 2 } })).toEqual([
      { kind: 'rush', yds: 0, pts: 2, note: 'twoPt' },
    ]);
  });

  it('makes an offensive fumble recovery for a TD a rushing touchdown piece', () => {
    expect(decompose('WR', null, { total: 6, stats: { '63': 1 }, applied: { '63': 6 } })).toEqual([
      { kind: 'rushTD', yds: 0, pts: 6, note: 'fumTD' },
    ]);
  });

  it('skips a stat the position scores zero, so a D/ST forced fumble is silent', () => {
    expect(decompose('DST', null, { total: 0, stats: { '106': 1 }, applied: { '106': 0 } })).toEqual([]);
    expect(decompose('DST', null, { total: 1, stats: { '99': 1, '106': 1 }, applied: { '99': 1, '106': 0 } })).toEqual([
      { kind: 'sack', yds: 0, pts: 1 },
    ]);
  });

  it('caps a new special at eight pieces', () => {
    const pieces = decompose('RB', null, { total: 6, stats: { '108': 12 }, applied: { '108': 6 } });

    expect(pieces).toHaveLength(8);
    expect(pieces.every(p => p.note === 'tackle')).toBe(true);
    expect(sumOf(pieces)).toBe(6);
  });
});

describe('describeAdjust', () => {
  it('names the direction of the points for defense', () => {
    expect(describeAdjust('DST', 'Bengals D/ST', -3)).toBe('Bengals D/ST give up points');
    expect(describeAdjust('DST', 'Bengals D/ST', 2)).toBe('Bengals D/ST tighten up');
    expect(describeAdjust('DP', 'Warner', 1.5)).toBe('Warner makes a stop');
    expect(describeAdjust('DP', 'Warner', -1.5)).toBe('Warner loses points');
    expect(describeAdjust('QB', 'Love', 1.5)).toBe('Love gains points');
    expect(describeAdjust('QB', 'Love', -1.5)).toBe('Love loses points');
  });
});

describe('eventsFromPoll for the defense feed', () => {
  const slot = (id: string, name: string, last: string, pos: Pos): any => ({
    id,
    name,
    last,
    pos,
    team: 'x',
    num: 1,
    proj: 0,
    skin: 0,
    hair: 'short',
    window: [0, 1],
  });
  const empty = (pos: Pos): any => slot('empty', 'EMPTY', 'EMPTY', pos);
  const slateWith = (lanes: any[]): Slate => ({
    me: { name: 'Me', owner: 'YOU' },
    opp: { name: 'Opp', owner: 'THEM' },
    lanes,
    events: [],
    teamColors: {},
    axis: [],
    clockLabel: () => '',
    statusLabel: () => '',
  }) as Slate;

  const defSlate = slateWith([
    { slot: 'D/ST', me: slot('-16004', 'Bengals D/ST', 'D/ST', 'DST'), opp: empty('DST') },
    { slot: 'QB', me: slot('1234', 'Jordan Love', 'Love', 'QB'), opp: empty('QB') },
  ]);
  const love = actualNamed('Jordan Love');

  it('names the D/ST by team and calls allowed points a give-up', () => {
    const events = eventsFromPoll(defSlate, null, {
      actuals: { '-16004': { total: -3, stats: {}, applied: { '124': -3 } }, '1234': love },
      out: [],
    }, 1, 1);
    const def = events.filter(e => e.lane === 0);

    expect(def).toHaveLength(1);
    expect(def[0]).toMatchObject({ kind: 'rush', yds: 0, pts: -3, text: 'Bengals D/ST give up points' });
    expect(events.filter(e => e.lane === 1)[0].text).toBe('Love completes 39 yds');
  });

  it('labels a D/ST sack and a ruled-out D/ST with the team name', () => {
    const sack = eventsFromPoll(defSlate, null, {
      actuals: { '-16004': { total: 1, stats: { '99': 1 }, applied: { '99': 1 } } },
      out: [],
    }, 1, 1);
    const ruledOut = eventsFromPoll(defSlate, null, {
      actuals: { '-16004': { total: 0, stats: {}, applied: {} } },
      out: ['-16004'],
    }, 1, 1);

    expect(sack).toHaveLength(1);
    expect(sack[0].kind).toBe('sack');
    expect(sack[0].text.startsWith('Bengals D/ST ')).toBe(true);
    expect(ruledOut).toHaveLength(1);
    expect(ruledOut[0]).toMatchObject({ kind: 'injury', text: 'Bengals D/ST ruled OUT' });
  });

  it('writes a note piece’s text with the D/ST full name and a player’s last name', () => {
    const events = eventsFromPoll(defSlate, null, {
      actuals: {
        '-16004': { total: 0.75, stats: { '108': 1 }, applied: { '108': 0.75 } },
        '1234': { total: 2, stats: { '19': 1 }, applied: { '19': 2 } },
      },
      out: [],
    }, 1, 1);

    expect(events.map(e => [e.kind, e.pts, e.text])).toEqual([
      ['rush', 0.75, 'Bengals D/ST makes a tackle'],
      ['pass', 2, 'Love converts the two-point try'],
    ]);
  });
});

const tiersOf = (): DstHistory['tiers'] => dstTiers(league.settings.scoringSettings.scoringItems);
const liveTiers = tiersOf();
const CIN = 4;
const LIVE_NOW = 1790531264000;

const liveToT = (week: number, ms: number): number => buildTimeline(kickoffsOf(week), TZ).toT(ms);

const bengalsActual = (playerId: string): Actual => {
  const player = liveMatchup.schedule
    .flatMap((m: any) => [m.home, m.away])
    .flatMap((side: any) => side.rosterForCurrentScoringPeriod.entries)
    .map((e: any) => e.playerPoolEntry.player)
    .find((p: any) => String(p.id) === playerId);
  return actualOf(player, WEEK)!;
};

const historyOf = (proTeamId: number): DstHistory => ({
  tiers: liveTiers,
  ...scoresAgainst(summaryFixture, proTeamId),
});

describe('dstTiers and tierPoints', () => {
  const { pa, ya } = liveTiers;

  it('reads the points-allowed tiers from the league’s D/ST overrides', () => {
    expect(tierPoints(pa, 0)).toBe(5);
    expect(tierPoints(pa, 6)).toBe(4);
    expect(tierPoints(pa, 7)).toBe(3);
    expect(tierPoints(pa, 13)).toBe(3);
    expect(tierPoints(pa, 14)).toBe(1);
    expect(tierPoints(pa, 18)).toBe(0);
    expect(tierPoints(pa, 28)).toBe(-1);
    expect(tierPoints(pa, 35)).toBe(-3);
    expect(tierPoints(pa, 46)).toBe(-5);
    expect(tierPoints(pa, 99)).toBe(-5);
  });

  it('reads the yards-allowed tiers the same way', () => {
    expect(tierPoints(ya, 0)).toBe(5);
    expect(tierPoints(ya, 13)).toBe(5);
    expect(tierPoints(ya, 99)).toBe(5);
    expect(tierPoints(ya, 100)).toBe(3);
    expect(tierPoints(ya, 159)).toBe(3);
    expect(tierPoints(ya, 250)).toBe(2);
    expect(tierPoints(ya, 320)).toBe(0);
    expect(tierPoints(ya, 420)).toBe(-3);
    expect(tierPoints(ya, 460)).toBe(-5);
    expect(tierPoints(ya, 520)).toBe(0);
    expect(tierPoints(ya, 700)).toBe(0);
  });

  it('prefers the D/ST override over the flat points', () => {
    expect(dstTiers([{ statId: 89, points: 0, pointsOverrides: { '16': 6 } }]).pa[0].pts).toBe(6);
    expect(dstTiers([{ statId: 128, points: 4 }]).ya[0].pts).toBe(4);
  });

  it('counts a tier the league never scored as zero', () => {
    expect(dstTiers([]).pa).toHaveLength(9);
    expect(dstTiers([]).ya).toHaveLength(9);
    expect(tierPoints(dstTiers([]).pa, 0)).toBe(0);
    expect(tierPoints(dstTiers([]).ya, 150)).toBe(0);
    expect(tierPoints(dstTiers([{ statId: 128, points: 5 }]).pa, 0)).toBe(0);
  });
});

describe('actualOf for a live defense', () => {
  it('carries the game id and pro team the summary needs', () => {
    const bengals = bengalsActual('-16004');

    expect(bengals.total).toBe(4);
    expect(bengals.stats['120']).toBe(14);
    expect(bengals.stats['127']).toBe(159);
    expect(bengals.applied['92']).toBe(1);
    expect(bengals.eventId).toBe('401872950');
    expect(bengals.proTeamId).toBe(CIN);
  });

  it('leaves the game id out of an actual with no game entry', () => {
    expect(actualOf({ stats: [{ statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: WEEK, appliedTotal: 1, stats: {} }] }, WEEK))
      .toEqual({ total: 1, stats: {}, applied: {} });
  });
});

describe('eventsFromPoll for a D/ST with a points-allowed history', () => {
  const slot = (over: any): any => ({
    id: over.id,
    name: over.name,
    last: over.last ?? 'D/ST',
    pos: over.pos ?? 'DST',
    team: 'CIN',
    num: 1,
    proj: 0,
    skin: 0,
    hair: 'helmet',
    window: [0.2, 0.5],
  });
  const slateOfDst = (lanes: any[]): Slate => ({
    me: { name: 'Me', owner: 'YOU' },
    opp: { name: 'Opp', owner: 'THEM' },
    lanes,
    events: [],
    teamColors: {},
    axis: [],
    clockLabel: () => '',
    statusLabel: () => '',
  }) as Slate;
  const dstSlate = slateOfDst([
    { slot: 'D/ST', me: slot({ id: '-16004', name: 'Bengals D/ST' }), opp: slot({ id: '-16019', name: 'Giants D/ST', team: 'NYG' }) },
  ]);
  const T_NOW = 0.3;
  const t6 = (e: { t: number }): number => Number(e.t.toFixed(6));
  const shown = (events: PlayEvent[]): string[] =>
    events.map(e => `${t6(e)} ${e.pts} ${e.text}`);

  const history = historyOf(CIN);

  it('rebuilds the tier start, the scores allowed and the yards remainder', () => {
    const cur = {
      actuals: {
        '-16004': {
          total: 4,
          stats: { '120': 14, '127': 159 },
          applied: { '92': 1, '129': 3 },
        },
      },
      out: [],
    };

    const events = eventsFromPoll(dstSlate, null, cur, T_NOW, 1, { '-16004': history });

    expect(shown(events)).toEqual([
      '0.2 10 Bengals D/ST take the field',
      '0.210309 -2 Bengals D/ST allow a score (7 allowed)',
      '0.279475 -2 Bengals D/ST allow a score (14 allowed)',
      '0.3 -2 Bengals D/ST give up yards',
    ]);
    expect(events.every(e => e.kind === 'rush')).toBe(true);
    expect(events.every(e => e.yds === 0)).toBe(true);
    expect(sumOf(events.map(e => ({ kind: e.kind, yds: e.yds, pts: e.pts })))).toBe(4);
    expect(events.map(e => e.id)).toEqual([1, 2, 3, 4]);
    expect(events.every(e => e.side === 'me' && e.lane === 0)).toBe(true);
  });

  it('keeps the scores it allowed and spreads its own plays between them', () => {
    const cur = {
      actuals: {
        '-16004': {
          total: 4,
          stats: { '120': 14, '127': 159, '96': 1 },
          applied: { '92': 1, '129': 3, '96': 2 },
        },
      },
      out: [],
    };

    const events = eventsFromPoll(dstSlate, null, cur, T_NOW, 1, { '-16004': history });

    expect(shown(events)).toEqual([
      '0.2 10 Bengals D/ST take the field',
      '0.210309 -2 Bengals D/ST allow a score (7 allowed)',
      '0.25 2 Bengals D/ST recover a fumble',
      '0.279475 -2 Bengals D/ST allow a score (14 allowed)',
      '0.3 -4 Bengals D/ST give up yards',
    ]);
    expect(sumOf(events.map(e => ({ kind: e.kind, yds: e.yds, pts: e.pts })))).toBe(4);
  });

  it('hides a score that did not move the tier', () => {
    const flat = {
      tiers: liveTiers,
      plays: [{ g: 110 / 3600, pa: 7 }, { g: 848 / 3600, pa: 14 }, { g: 0.25, pa: 15 }],
      gNow: 0.296389,
    };
    const cur = {
      actuals: { '-16004': { total: 1, stats: { '120': 15, '127': 159 }, applied: { '92': 1, '129': 3 } } },
      out: [],
    };

    const events = eventsFromPoll(dstSlate, null, cur, T_NOW, 1, { '-16004': flat });

    expect(shown(events)).toEqual([
      '0.2 10 Bengals D/ST take the field',
      '0.210309 -2 Bengals D/ST allow a score (7 allowed)',
      '0.279475 -2 Bengals D/ST allow a score (14 allowed)',
      '0.3 -5 Bengals D/ST give up yards',
    ]);
    expect(sumOf(events.map(e => ({ kind: e.kind, yds: e.yds, pts: e.pts })))).toBe(1);
  });

  it('caps a play the game finished after the timeline at the current time', () => {
    const late = { tiers: liveTiers, plays: [{ g: 1, pa: 20 }], gNow: 0.5 };
    const cur = {
      actuals: { '-16004': { total: 0, stats: { '120': 20, '127': 159 }, applied: { '121': 0, '129': 3 } } },
      out: [],
    };

    const events = eventsFromPoll(dstSlate, null, cur, T_NOW, 1, { '-16004': late });

    expect(shown(events)).toEqual([
      '0.2 10 Bengals D/ST take the field',
      '0.3 -5 Bengals D/ST allow a score (20 allowed)',
      '0.3 -5 Bengals D/ST give up yards',
    ]);
    expect(events[events.length - 1].t).toBe(0.3);
  });

  it('seeds the kickoff alone for a defense that has not scored yet', () => {
    const scoreless = { tiers: liveTiers, plays: [], gNow: 0.296389 };
    const cur = {
      actuals: { '-16004': { total: 10, stats: { '120': 0, '127': 40 }, applied: { '89': 5, '128': 5 } } },
      out: [],
    };

    const events = eventsFromPoll(dstSlate, null, cur, T_NOW, 1, { '-16004': scoreless });

    expect(shown(events)).toEqual(['0.2 10 Bengals D/ST take the field']);
  });

  it('leaves today’s behavior alone without a history entry', () => {
    const cur = {
      actuals: { '-16004': { total: 4, stats: { '120': 14, '127': 159 }, applied: { '92': 1, '129': 3 } } },
      out: [],
    };

    expect(shown(eventsFromPoll(dstSlate, null, cur, T_NOW, 1))).toEqual([
      '0.25 4 Bengals D/ST tighten up',
    ]);
  });

  it('ignores the history for every poll after the first', () => {
    const cur = {
      actuals: { '-16004': { total: 4, stats: { '120': 14, '127': 159 }, applied: { '92': 1, '129': 3 } } },
      out: [],
    };
    const events = eventsFromPoll(dstSlate, null, cur, T_NOW, 1, { '-16004': history });

    const next = {
      actuals: { '-16004': { total: 7, stats: { '120': 14, '127': 159, '99': 1 }, applied: { '92': 1, '129': 3, '99': 1 } } },
      out: [],
    };
    const added = eventsFromPoll(dstSlate, cur, next, T_NOW, 5, { '-16004': history });

    expect(added).toHaveLength(2);
    expect(added.map(e => [e.id, e.kind, e.pts])).toEqual([[5, 'sack', 1], [6, 'rush', 2]]);
    expect(added.every(e => e.t > T_NOW)).toBe(true);
    expect(events).toHaveLength(4);
  });

  it('uses the real game clock of the live capture to place the scores', () => {
    const toT = buildTimeline(kickoffsOf(WEEK), TZ).toT;
    const w0 = toT(1790528400000);
    const tNow = liveToT(WEEK, LIVE_NOW);
    const game = slot({ id: '-16004', name: 'Bengals D/ST' });
    game.window = [w0, toT(1790528400000 + 3.5 * 60 * 60 * 1000)];
    const slate = slateOfDst([{ slot: 'D/ST', me: slot({ id: '-16019', name: 'Giants D/ST', team: 'NYG' }), opp: game }]);
    const cur = {
      actuals: { '-16004': { total: 4, stats: { '120': 14, '127': 159 }, applied: { '92': 1, '129': 3 } } },
      out: [],
    };

    const events = eventsFromPoll(slate, null, cur, tNow, 1, { '-16004': history });

    expect(shown(events)).toEqual([
      '0.200957 10 Bengals D/ST take the field',
      '0.205666 -2 Bengals D/ST allow a score (7 allowed)',
      '0.237259 -2 Bengals D/ST allow a score (14 allowed)',
      '0.246635 -2 Bengals D/ST give up yards',
    ]);
    expect(events.every(e => e.side === 'opp')).toBe(true);
  });
});

describe('eventsFromPoll for a D/ST with a yards-allowed history', () => {
  const slot = (over: any): any => ({
    id: over.id,
    name: over.name,
    last: over.last ?? 'D/ST',
    pos: over.pos ?? 'DST',
    team: over.team ?? 'CIN',
    num: 1,
    proj: 0,
    skin: 0,
    hair: 'helmet',
    window: [0.2, 0.5],
  });
  const slateOfDst = (lanes: any[]): Slate => ({
    me: { name: 'Me', owner: 'YOU' },
    opp: { name: 'Opp', owner: 'THEM' },
    lanes,
    events: [],
    teamColors: {},
    axis: [],
    clockLabel: () => '',
    statusLabel: () => '',
  }) as Slate;
  const t6 = (e: { t: number }): number => Number(e.t.toFixed(6));
  const shown = (events: PlayEvent[]): string[] =>
    events.map(e => `${t6(e)} ${e.pts} ${e.text}`);

  const PIT = 23;
  const toT = buildTimeline(kickoffsOf(WEEK), TZ).toT;
  const w0 = toT(1790528400000);
  const tNow = liveToT(WEEK, LIVE_NOW);

  const steelersSlate = (): Slate => {
    const game = slot({ id: '-16023', name: 'Steelers D/ST', team: 'PIT' });
    game.window = [w0, toT(1790528400000 + 3.5 * 60 * 60 * 1000)];
    return slateOfDst([{ slot: 'D/ST', me: slot({ id: '-16019', name: 'Giants D/ST', team: 'NYG' }), opp: game }]);
  };
  const steelersActual = (): Actual => bengalsActual('-16023');
  const steelersHistory = (): DstHistory => ({
    tiers: liveTiers,
    plays: scoresAgainst(summaryFixture, PIT).plays,
    gNow: scoresAgainst(summaryFixture, PIT).gNow,
    drives: yardsAgainst(summaryFixture, PIT),
  });

  it('places each yards tier drop at the drive that crossed it', () => {
    const cur = steelersActual();
    expect([cur.total, cur.stats['120'], cur.stats['127']]).toEqual([6, 7, 110]);

    const events = eventsFromPoll(steelersSlate(), null, {
      actuals: { '-16023': cur },
      out: [],
    }, tNow, 1, { '-16023': steelersHistory() });

    expect(shown(events)).toEqual([
      '0.200957 10 Steelers D/ST take the field',
      '0.224502 -2 Steelers D/ST allow a score (7 allowed)',
      '0.246635 -2 Steelers D/ST give up yards (105 allowed)',
    ]);
    expect(events.every(e => e.kind === 'rush' && e.yds === 0)).toBe(true);
    expect(sumOf(events.map(e => ({ kind: e.kind, yds: e.yds, pts: e.pts })))).toBe(6);
    expect(events.every(e => e.side === 'opp')).toBe(true);
  });

  it('reports a tier climb as the defense tightening up', () => {
    const cur = steelersActual();
    const history = steelersHistory();
    history.drives = [{ g: null, ya: 250 }, { g: null, ya: 90 }];

    const events = eventsFromPoll(steelersSlate(), null, {
      actuals: { '-16023': { total: 6, stats: cur.stats, applied: cur.applied } },
      out: [],
    }, tNow, 1, { '-16023': history });

    const yards = events.filter(e => e.text.includes('yards (') || e.text.includes('tighten up ('));
    expect(shown(yards)).toEqual([
      '0.246635 -3 Steelers D/ST give up yards (250 allowed)',
      '0.246635 3 Steelers D/ST tighten up (90 allowed)',
    ]);
  });

  it('skips a drive that did not move the yards tier', () => {
    const cur = steelersActual();
    const history = steelersHistory();
    history.drives = [{ g: null, ya: 40 }, { g: null, ya: 80 }];

    const events = eventsFromPoll(steelersSlate(), null, {
      actuals: { '-16023': cur },
      out: [],
    }, tNow, 1, { '-16023': history });

    expect(shown(events)).toEqual([
      '0.200957 10 Steelers D/ST take the field',
      '0.224502 -2 Steelers D/ST allow a score (7 allowed)',
      '0.246635 -2 Steelers D/ST give up yards',
    ]);
  });
});

describe('decompose on a later poll splits yardage by the play count', () => {
  const empty: Actual = { total: 0, stats: {}, applied: {} };

  it('reads one 80-yard catch and its touchdown as two pieces', () => {
    const cur: Actual = { total: 14, stats: { '42': 80, '43': 1 }, applied: { '42': 8, '43': 6 } };

    expect(decompose('WR', empty, cur)).toEqual([
      { kind: 'catch', yds: 80, pts: 8 },
      { kind: 'recTD', yds: 0, pts: 6 },
    ]);
  });

  it('splits the yardage once per reception ESPN counted', () => {
    const prev: Actual = { total: 4.5, stats: { '53': 3, '42': 30 }, applied: { '42': 3, '53': 1.5 } };
    const cur: Actual = { total: 8.3, stats: { '53': 5, '42': 58 }, applied: { '42': 5.8, '53': 2.5 } };
    const pieces = decompose('WR', prev, cur);

    expect(pieces).toEqual([
      { kind: 'catch', yds: 14, pts: 1.9 },
      { kind: 'catch', yds: 14, pts: 1.9 },
    ]);
    expect(pieces.reduce((total, p) => total + p.yds, 0)).toBe(28);
    expect(sumOf(pieces)).toBe(3.8);
  });

  it('splits rushing yardage once per attempt', () => {
    const cur: Actual = { total: 1.8, stats: { '23': 3, '24': 12 }, applied: { '24': 1.8 } };

    expect(decompose('RB', empty, cur)).toEqual([
      { kind: 'rush', yds: 4, pts: 0.6 },
      { kind: 'rush', yds: 4, pts: 0.6 },
      { kind: 'rush', yds: 4, pts: 0.6 },
    ]);
  });

  it('leaves the first observation on the yards-per-15 spread', () => {
    const pieces = decompose('QB', null, actualNamed('Jordan Love'));

    expect(shown(pieces)).toBe(
      [
        'pass 39 1.56', 'pass 39 1.56', 'passTD 0 4', 'pass 39 1.56', 'pass 39 1.56',
        'passTD 0 4', 'pass 39 1.56', 'pass 39 1.56', 'int 0 -2', 'pass 39 1.56', 'pass 39 1.56',
      ].join(', '),
    );
    expect(pieces).toHaveLength(11);
  });
});

describe('decompose for the first observation splits yardage by the play count', () => {
  it('reads Deebo’s 80-yard lateral touchdown as one catch', () => {
    const cur: Actual = {
      total: 14.3,
      stats: { '42': 80, '43': 1, '23': 1, '24': 3 },
      applied: { '42': 8, '43': 6, '24': 0.3 },
    };
    const pieces = decompose('WR', null, cur);

    expect(pieces).toEqual([
      { kind: 'rush', yds: 3, pts: 0.3 },
      { kind: 'recTD', yds: 0, pts: 6 },
      { kind: 'catch', yds: 80, pts: 8 },
    ]);
    expect(pieces.filter(p => p.kind === 'catch' && p.yds === 80)).toHaveLength(1);
    expect(sumOf(pieces)).toBe(14.3);
  });
});
