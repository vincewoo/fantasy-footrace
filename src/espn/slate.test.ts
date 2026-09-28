import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fmt, snapshotAt } from '../model/derive';
import type { Slate } from '../model/types';
import LOOKS from './looks.json';
import { PRO_TEAMS, proTeamById } from './proTeams';
import { buildSlate, LANE_ORDER, listTeams, posOf, SLOT_LABEL } from './slate';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

const league = fixture('week3-pregame.json');
const season = fixture('season-2026-proteams.json');
const TZ = 'America/New_York';
const slate = buildSlate(league, season, 1, { timeZone: TZ });

interface MiniEntry {
  lineupSlotId: number;
  playerPoolEntry: { player: Record<string, unknown> };
}

const entry = (slot: number, id: number, name: string, posId: number, teamId: number): MiniEntry => ({
  lineupSlotId: slot,
  playerPoolEntry: {
    player: { id, fullName: name, lastName: name, defaultPositionId: posId, proTeamId: teamId, jersey: '9', stats: [] },
  },
});

const miniLeague = {
  scoringPeriodId: 1,
  members: [
    { id: 'm1', firstName: 'Ann', displayName: 'ann' },
    { id: 'm2', firstName: '', displayName: 'bob' },
  ],
  teams: [
    { id: 1, name: 'Mine', primaryOwner: 'm1' },
    { id: 2, name: 'Theirs', primaryOwner: 'm2' },
  ],
  schedule: [
    {
      id: 5,
      home: {
        teamId: 1,
        rosterForCurrentScoringPeriod: {
          entries: [
            entry(0, 101, 'Mine QB', 1, 8),
            entry(4, 102, 'Mine WR A', 3, 8),
            entry(2, 103, 'Mine RB', 2, 8),
            entry(17, 104, 'Mine K', 5, 10),
            entry(20, 105, 'Mine Bench', 2, 8),
          ],
        },
      },
      away: {
        teamId: 2,
        rosterForCurrentScoringPeriod: {
          entries: [
            entry(2, 201, 'Theirs RB', 2, 20),
            entry(6, 202, 'Theirs TE', 4, 20),
            entry(0, 203, 'Theirs QB', 1, 20),
            entry(4, 204, 'Theirs WR', 3, 20),
          ],
        },
      },
    },
  ],
};

const miniSeason = {
  settings: {
    proTeams: [
      {
        id: 8,
        abbrev: 'DET',
        proGamesByScoringPeriod: {
          '1': [{ id: 99, date: 1790528400000, homeProTeamId: 8, awayProTeamId: 20 }],
        },
      },
    ],
  },
};

describe('proTeams', () => {
  it('keys all 32 teams by ESPN proTeamId', () => {
    const ids = Object.keys(PRO_TEAMS).map(Number).sort((a, b) => a - b);
    expect(ids).toHaveLength(32);
    expect(ids).not.toContain(31);
    expect(ids).not.toContain(32);
    expect(ids[0]).toBe(1);
    expect(ids[31]).toBe(34);
    expect(proTeamById(33)).toMatchObject({ abbrev: 'BAL' });
    expect(proTeamById(34)).toMatchObject({ abbrev: 'HOU' });
  });

  it('copies the design colors for its 15 teams', () => {
    expect(PRO_TEAMS[2]).toEqual({ id: 2, abbrev: 'BUF', c1: '#00338D', c2: '#C60C30' });
    expect(PRO_TEAMS[19]).toEqual({ id: 19, abbrev: 'NYG', c1: '#0B2265', c2: '#A71930' });
    expect(PRO_TEAMS[23]).toEqual({ id: 23, abbrev: 'PIT', c1: '#1b1b1b', c2: '#FFB612', numC: '#FFB612' });
    expect(PRO_TEAMS[24]).toEqual({ id: 24, abbrev: 'LAC', c1: '#0080C6', c2: '#FFC20E' });
    expect(PRO_TEAMS[13]).toEqual({ id: 13, abbrev: 'LV', c1: '#1b1b1b', c2: '#A5ACAF' });
  });

  it('uses the official palettes for the other 17', () => {
    expect(PRO_TEAMS[25]).toEqual({ id: 25, abbrev: 'SF', c1: '#AA0000', c2: '#B3995D' });
    expect(PRO_TEAMS[9]).toEqual({ id: 9, abbrev: 'GB', c1: '#203731', c2: '#FFB612' });
    expect(PRO_TEAMS[12]).toEqual({ id: 12, abbrev: 'KC', c1: '#E31837', c2: '#FFB81C' });
    expect(PRO_TEAMS[34]).toEqual({ id: 34, abbrev: 'HOU', c1: '#03202F', c2: '#A71930' });
  });

  it('throws for an unknown id', () => {
    expect(() => proTeamById(31)).toThrow('unknown proTeamId 31');
    expect(() => proTeamById(99)).toThrow('unknown proTeamId 99');
  });
});

describe('slot and position maps', () => {
  it('labels the league slots', () => {
    expect(SLOT_LABEL).toMatchObject({
      0: 'QB',
      1: 'TQB',
      2: 'RB',
      3: 'RB/WR',
      4: 'WR',
      5: 'WR/TE',
      6: 'TE',
      7: 'OP',
      15: 'DP',
      16: 'D/ST',
      17: 'K',
      23: 'FLEX',
    });
    expect([8, 9, 10, 11, 12, 13, 14].map(id => SLOT_LABEL[id])).toEqual([
      'DT',
      'DE',
      'LB',
      'DL',
      'CB',
      'S',
      'DB',
    ]);
  });

  it('orders lanes by slot', () => {
    expect(LANE_ORDER).toEqual([0, 1, 2, 3, 4, 5, 6, 23, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it('maps defaultPositionId, calling the defensive players DP', () => {
    expect([1, 2, 3, 4, 5, 16].map(posOf)).toEqual(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);
    expect([8, 9, 10, 11, 12, 13].map(posOf)).toEqual(['DP', 'DP', 'DP', 'DP', 'DP', 'DP']);
    expect(posOf(10)).toBe('DP');
    expect(posOf(11)).toBe('DP');
  });

  it('throws on anything else', () => {
    expect(() => posOf(7)).toThrow('unknown defaultPositionId 7');
    expect(() => posOf(14)).toThrow('unknown defaultPositionId 14');
    expect(() => posOf(0)).toThrow('unknown defaultPositionId 0');
  });
});

describe('listTeams', () => {
  it('lists the twelve league teams with their primary owner', () => {
    const teams = listTeams(league);
    expect(teams).toHaveLength(12);
    expect(teams.map(t => t.id)).toEqual([1, 2, 3, 6, 9, 10, 11, 13, 14, 15, 16, 17]);
    expect(teams[0]).toEqual({ id: 1, name: 'Somethings Gotta Gibbs', owner: 'tejas & Vince' });
    expect(teams[5]).toEqual({ id: 10, name: 'REAPR Sleepers', owner: 'Ian' });
  });

  it('falls back to the display name when the first name is empty', () => {
    const members = [{ id: 'm1', firstName: '', displayName: 'espn123' }];
    const teams = [{ id: 1, name: 'Mine', primaryOwner: 'm1' }];
    expect(listTeams({ members, teams })).toEqual([{ id: 1, name: 'Mine', owner: 'espn123' }]);
  });
});

describe('buildSlate for the recorded week 3', () => {
  it('names the two teams from the matchup', () => {
    expect(slate.me).toEqual({ name: 'Somethings Gotta Gibbs', owner: 'YOU' });
    expect(slate.opp).toEqual({ name: 'REAPR Sleepers', owner: 'IAN' });
  });

  it('builds the ten lanes slot by slot', () => {
    const rows = slate.lanes.map(l => [
      l.slot,
      `${l.me.name} (${l.me.proj})`,
      `${l.opp.name} (${l.opp.proj})`,
    ]);

    expect(rows).toEqual([
      ['QB', 'Jared Goff (16.62)', 'Dak Prescott (17.11)'],
      ['RB', 'Jahmyr Gibbs (23.4)', 'Chase Brown (14.62)'],
      ['RB/WR', 'Derrick Henry (17)', 'Parker Washington (12.36)'],
      ['WR', 'Davante Adams (13.04)', 'CeeDee Lamb (14.04)'],
      ['WR', 'Deebo Samuel Sr. (10.5)', 'Garrett Wilson (11.86)'],
      ['TE', 'George Kittle (10.53)', 'Isaiah Likely (9.94)'],
      ['FLEX', 'Jeremiyah Love (11.19)', 'TreVeyon Henderson (9.58)'],
      ['DP', 'Fred Warner (6.29)', 'Zack Baun (6.64)'],
      ['D/ST', 'Giants D/ST (6.96)', 'Bengals D/ST (6.69)'],
      ['K', 'Brandon Aubrey (8.73)', "Ka'imi Fairbairn (8.31)"],
    ]);
  });

  it('sums to the projections the league reports', () => {
    const sum = (side: 'me' | 'opp') => slate.lanes.reduce((total, lane) => total + lane[side].proj, 0);
    const matchup = league.schedule.find((m: any) => m.away.teamId === 1);

    expect(sum('me')).toBeCloseTo(124.26, 2);
    expect(sum('opp')).toBeCloseTo(111.15, 2);
    expect(sum('me')).toBeCloseTo(matchup.away.totalProjectedPointsLive, 1);
    expect(sum('opp')).toBeCloseTo(matchup.home.totalProjectedPointsLive, 1);
  });

  it('reads the IDP and D/ST rows', () => {
    expect(slate.lanes[7].me).toMatchObject({
      id: '3138826',
      name: 'Fred Warner',
      last: 'Warner',
      pos: 'DP',
      team: 'SF',
      num: 54,
      proj: 6.29,
    });
    expect(slate.lanes[7].me.tag).toBeUndefined();
    expect(slate.lanes[8].me).toMatchObject({
      id: '-16019',
      name: 'Giants D/ST',
      last: 'D/ST',
      pos: 'DST',
      team: 'NYG',
      num: 'D',
      tag: 'NYG D',
      proj: 6.96,
    });
    expect(slate.lanes[8].opp).toMatchObject({ pos: 'DST', num: 'D', tag: 'CIN D', proj: 6.69 });
    expect(slate.lanes[9].me).toMatchObject({ name: 'Brandon Aubrey', pos: 'K', team: 'DAL', num: 17 });
  });

  it('times every player window from the real kickoffs', () => {
    const expectWindow = (w: [number, number], a: number, b: number) => {
      expect(w[0]).toBeCloseTo(a, 6);
      expect(w[1]).toBeCloseTo(b, 6);
    };

    expectWindow(slate.lanes[0].me.window, 0.200957, 0.401914); // Goff, DET, Sun 1:00
    expectWindow(slate.lanes[0].opp.window, 0.397129, 0.598086); // Prescott, DAL, Sun 4:25
    expectWindow(slate.lanes[1].me.window, 0.200957, 0.401914); // Gibbs, DET, Sun 1:00
    expectWindow(slate.lanes[2].me.window, 0.397129, 0.598086); // Henry, BAL, Sun 4:25
    expectWindow(slate.lanes[3].me.window, 0.598086, 0.799043); // Adams, LAR, Sun 8:20
    expectWindow(slate.lanes[4].me.window, 0.377990, 0.578947); // Deebo, SF, Sun 4:05
    expectWindow(slate.lanes[5].me.window, 0.377990, 0.578947); // Kittle, SF, Sun 4:05
    expectWindow(slate.lanes[7].me.window, 0.377990, 0.578947); // Warner, SF, Sun 4:05
    expectWindow(slate.lanes[7].opp.window, 0.799043, 1); // Baun, PHI, Mon 8:15
    expectWindow(slate.lanes[8].me.window, 0.200957, 0.401914); // Giants D/ST, NYG, Sun 1:00
  });

  it('labels status from the player window', () => {
    const goff = slate.lanes[0].me;
    expect(slate.statusLabel(goff, 0)).toBe('KO SUN 1:00 PM');
    expect(slate.statusLabel(goff, 0.2)).toBe('KO SUN 1:00 PM');
    expect(slate.statusLabel(goff, 0.3)).toBe('LIVE');
    expect(slate.statusLabel(goff, 0.401914)).toBe('FINAL');

    const baun = slate.lanes[7].opp;
    expect(slate.statusLabel(baun, 0.5)).toBe('KO MON 8:15 PM');
    expect(slate.statusLabel(baun, 0.9)).toBe('LIVE');
    expect(slate.statusLabel(baun, 1)).toBe('FINAL');
  });

  it('carries the timeline axis, an empty event list and the lane colors', () => {
    expect(slate.events).toEqual([]);
    expect(slate.clockLabel(0.200957)).toBe('SUN 1:00 PM');
    expect(slate.axis.map(a => a.label)).toEqual([
      'THU 8:15 PM',
      'SUN 1 PM',
      'SUN 4:05 PM',
      'SUN 8:20 PM',
      'MON 8:15 PM',
      'END',
    ]);

    const abbrevs = [...new Set(slate.lanes.flatMap(l => [l.me.team, l.opp.team]))].sort();
    expect(Object.keys(slate.teamColors).sort()).toEqual(abbrevs);
    expect(slate.teamColors.SF).toEqual({ c1: '#AA0000', c2: '#B3995D' });
    expect(slate.teamColors.NYG).toEqual({ c1: '#0B2265', c2: '#A71930' });
    expect(slate.teamColors.CIN).toEqual({ c1: '#FB4F14', c2: '#1b1b1b' });
  });

  it('is deterministic and gives a player the same look on either side', () => {
    const again = buildSlate(league, season, 1, { timeZone: TZ });
    expect(again.lanes).toEqual(slate.lanes);

    const reverse = buildSlate(league, season, 10, { timeZone: TZ });
    const looks = (s: Slate) =>
      new Map(
        s.lanes
          .flatMap(l => [l.me, l.opp])
          .map(p => [p.id, [p.skin, p.sc, p.hair, p.hc, p.beard]] as const),
      );

    const before = looks(slate);
    const after = looks(reverse);
    expect([...before.keys()].sort()).toEqual([...after.keys()].sort());
    for (const [id, look] of before) expect(after.get(id)).toEqual(look);
  });

  it('takes skin, hair and beard from the measured headshots', () => {
    const measured = LOOKS as Record<string, string[]>;
    const players = slate.lanes.flatMap(l => [l.me, l.opp]);
    const henry = players.find(p => p.name === 'Derrick Henry')!;
    const [sc, hc, hair, beard] = measured[henry.id];
    expect({ sc: henry.sc, hc: henry.hc, hair: henry.hair, beard: henry.beard }).toEqual({ sc, hc, hair, beard });

    for (const p of players.filter(p => p.pos !== 'DST')) {
      expect(p.sc).toBe(measured[p.id][0]);
      expect(p.hair).toBe(measured[p.id][2]);
      expect(p.beard).toBe(measured[p.id][3]);
      expect(p.band).toBe(measured[p.id][4]);
    }
    for (const p of players.filter(p => p.pos === 'DST')) {
      expect(p.sc).toBeUndefined();
      expect(p.hair).toBe('helmet');
      expect(p.beard).toBe('none');
    }
  });

  it('gives a player whose hair is hidden by a headband dark hair and the band', () => {
    const [id, look] = Object.entries(LOOKS as Record<string, string[]>).find(([, v]) => v[1] === '' && v[4])!;
    const league = structuredClone(miniLeague);
    league.schedule[0].home.rosterForCurrentScoringPeriod.entries[1] = entry(4, Number(id), 'Banded WR', 3, 8);
    const banded = buildSlate(league, miniSeason, 1, { timeZone: TZ }).lanes.flatMap(l => [l.me, l.opp]).find(p => p.id === id)!;

    expect(banded.hc).toBe('#1d1411');
    expect(banded.band).toBe(look[4]);
    expect(banded.hair).toBe(look[2]);
  });

  it('feeds snapshotAt before kickoff', () => {
    const snap = snapshotAt(slate, 0);
    expect(snap.totals).toEqual({ me: 0, opp: 0 });
    expect(snap.past).toEqual([]);
    expect(fmt(snap.projected.me)).toBe('124.3');
  });

  it('throws when the team has no matchup', () => {
    expect(() => buildSlate(league, season, 4, { timeZone: TZ })).toThrow('no matchup for team 4');
  });
});

describe('buildSlate corner cases', () => {
  const mini = buildSlate(miniLeague, miniSeason, 1, { timeZone: TZ });

  it('pairs lanes by slot, not by starter index', () => {
    expect(mini.lanes.map(l => l.slot)).toEqual(['QB', 'RB', 'WR', 'TE', 'K']);
    expect(mini.lanes.map(l => l.me.name)).toEqual(['Mine QB', 'Mine RB', 'Mine WR A', 'EMPTY', 'Mine K']);
    expect(mini.lanes.map(l => l.opp.name)).toEqual(['Theirs QB', 'Theirs RB', 'Theirs WR', 'Theirs TE', 'EMPTY']);
    expect(mini.opp.owner).toBe('BOB');
  });

  it('fills the unpaired side with an empty player', () => {
    expect(mini.lanes[3].me).toMatchObject({
      id: 'empty',
      name: 'EMPTY',
      last: 'EMPTY',
      pos: 'TE',
      team: 'NYJ',
      num: 0,
      proj: 0,
      window: [1, 1],
    });
    expect(mini.statusLabel(mini.lanes[3].me, 0)).toBe('KO SUN 1:00 PM');
    expect(mini.statusLabel(mini.lanes[3].me, 1)).toBe('FINAL');
  });

  it('falls back to a seeded look for a player with no headshot measurement', () => {
    const slate = buildSlate(miniLeague, season, 1, { timeZone: TZ });
    const players = slate.lanes.flatMap(l => [l.me, l.opp]).filter(p => p.id !== 'empty');
    for (const p of players) {
      expect((LOOKS as Record<string, unknown>)[p.id]).toBeUndefined();
      expect(p.sc).toBeUndefined();
    }
  });

  it('marks a player with no week game BYE', () => {
    const kicker = mini.lanes[4].me;
    expect(kicker).toMatchObject({ name: 'Mine K', team: 'TEN', window: [1, 1], proj: 0 });
    expect(mini.statusLabel(kicker, 0)).toBe('BYE');
  });
});

describe('buildSlate without a real season response', () => {
  it('throws when settings.proTeams is missing', () => {
    expect(() => buildSlate(league, { display: {}, settings: {} }, 1, { timeZone: TZ })).toThrow(
      'season response has no settings.proTeams',
    );
  });

  it('rejects the old top-level proTeams shape', () => {
    expect(() => buildSlate(league, { proTeams: [] }, 1, { timeZone: TZ })).toThrow(
      'season response has no settings.proTeams',
    );
  });
});

describe('co-GM owners', () => {
  it('lists every owner of a co-GM team joined with &', () => {
    const owners = new Map(listTeams(league).map(t => [t.id, t.owner]));
    expect(owners.get(1)).toBe('tejas & Vince');
    expect(owners.get(6)).toBe('Emma & Emily');
    expect(owners.get(9)).toBe('Gene & Alex');
    expect(owners.get(11)).toBe('Brian & Swapnil');
    expect(owners.get(17)).toBe('Jezmin & Julia');
  });

  it('keeps a single-owner team at one name', () => {
    const owners = new Map(listTeams(league).map(t => [t.id, t.owner]));
    expect(owners.get(10)).toBe('Ian');
    expect(owners.get(2)).toBe('Nazareth');
  });

  it('upper-cases every owner on the opponent side of the slate', () => {
    expect(buildSlate(league, season, 17, { timeZone: TZ }).opp.owner).toBe('EMMA & EMILY');
    expect(buildSlate(league, season, 10, { timeZone: TZ }).opp.owner).toBe('TEJAS & VINCE');
    expect(buildSlate(league, season, 1, { timeZone: TZ }).opp.owner).toBe('IAN');
  });

  it('lists the viewer side as YOU', () => {
    expect(buildSlate(league, season, 17, { timeZone: TZ }).me.owner).toBe('YOU');
  });

  const synth = (team: Record<string, unknown>): string =>
    listTeams({
      members: [
        { id: 's1', firstName: 'Ann', displayName: 'ann' },
        { id: 's2', firstName: 'Bob', displayName: 'bob' },
      ],
      teams: [{ id: 1, name: 'Team', ...team }],
    })[0].owner;

  it('puts the primary owner first when he is listed second', () => {
    expect(synth({ primaryOwner: 's2', owners: ['s1', 's2'] })).toBe('Bob & Ann');
  });

  it('shows a SWID listed twice only once', () => {
    expect(synth({ primaryOwner: 's1', owners: ['s1', 's1'] })).toBe('Ann');
    expect(synth({ primaryOwner: 's1', owners: ['s2', 's1'] })).toBe('Ann & Bob');
  });

  it('skips owners missing from members and returns empty when none are found', () => {
    expect(synth({ primaryOwner: 's1', owners: ['s9', 's2'] })).toBe('Ann & Bob');
    expect(synth({ primaryOwner: 's9', owners: ['s8'] })).toBe('');
    expect(synth({ primaryOwner: 's9', owners: ['s2'] })).toBe('Bob');
    expect(synth({ owners: ['s2'] })).toBe('Bob');
    expect(synth({})).toBe('');
  });
});
