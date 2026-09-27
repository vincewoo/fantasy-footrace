import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fmt, snapshotAt } from '../model/derive';
import type { EventKind, PlayEvent, Pos, Slate } from '../model/types';
import { buildSlate } from './slate';
import { buildTimeline } from './timeline';
import {
  actualOf,
  decompose,
  describeAdjust,
  describeLive,
  eventsFromPoll,
  readPoll,
  withEvents,
  type Actual,
  type Piece,
} from './live';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

const league = fixture('week3-pregame.json');
const season = fixture('season-2026-proteams.json');
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
        'catch 15 1.79', 'catch 15 1.79', 'catch 14 1.79', 'recTD 0 6', 'catch 14 1.79',
        'catch 14 1.79', 'catch 14 1.79', 'catch 14 1.76',
      ].join(', '),
    );
    expect(pieces).toHaveLength(8);
    expect(sumOf(pieces)).toBe(18.5);
  });

  it('splits Kraft’s two short catches', () => {
    const pieces = decompose('TE', null, actualNamed('Tucker Kraft'));

    expect(shown(pieces)).toBe('catch 13 2.3, catch 13 2.3');
    expect(sumOf(pieces)).toBe(4.6);
  });

  it('runs Bijan Robinson’s rushes around his two rushing scores and adds his catch', () => {
    const pieces = decompose('RB', null, actualNamed('Bijan Robinson'));

    expect(shown(pieces)).toBe(
      [
        'rush 25 2.43', 'rush 25 2.43', 'rush 24 2.43', 'rushTD 0 6', 'rush 24 2.43',
        'rush 24 2.43', 'rush 24 2.43', 'rushTD 0 6', 'rush 24 2.43', 'rush 24 2.39',
        'catch 19 2.9',
      ].join(', '),
    );
    expect(pieces).toHaveLength(11);
    expect(sumOf(pieces)).toBe(34.3);
  });

  it('lands an unknown stat on the last piece', () => {
    const pieces = decompose('WR', null, actualNamed('Drake London'));
    const yards = pieces.map(p => p.yds).join('/');
    const points = pieces.map(p => p.pts).join('/');

    expect(pieces).toHaveLength(8);
    expect(pieces.every(p => p.kind === 'catch')).toBe(true);
    expect(yards).toBe('25/25/24/24/24/24/24/24');
    expect(points).toBe('2.99/2.99/2.99/2.99/2.99/2.99/2.99/3.72');
    expect(sumOf(pieces)).toBe(24.65);
  });

  it('works on the delta between two polls', () => {
    const prev: Actual = { total: 12.0, stats: { '3': 200, '4': 1 }, applied: { '3': 8.0, '4': 4.0 } };
    const pieces = decompose('QB', prev, actualNamed('Jordan Love'));

    expect(shown(pieces)).toBe(
      [
        'pass 16 0.64', 'pass 16 0.64', 'passTD 0 4', 'pass 16 0.64', 'pass 16 0.64',
        'int 0 -2', 'pass 16 0.64', 'pass 16 0.64', 'pass 16 0.64',
      ].join(', '),
    );
    expect(pieces).toHaveLength(9);
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
    expect(events14).toHaveLength(9);
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

    expect(events).toHaveLength(2);
    expect(events.map(e => e.id)).toEqual([22, 23]);
    expect(events.map(e => [e.kind, e.yds, e.pts])).toEqual([
      ['pass', 15, 0.6],
      ['pass', 15, 0.6],
    ]);
    expect(events.every(e => e.t > toNow)).toBe(true);
    expect(events[0].text).toBe('Love completes 15 yds');
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
    const pieces = decompose('WR', null, actualNamed('Drake London'));
    const last = pieces[pieces.length - 1];

    expect(last.pts).toBe(3.72);
    expect(last.adjust).toBeUndefined();
    expect(pieces.some(p => p.adjust !== undefined)).toBe(false);
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
});
