import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { fmt, snapshotAt } from '../model/derive';
import { loadLeagueInfo } from './load';
import { buildBoard, loadMnfBoard, mondayGames, pollMnf } from './mnf';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

const league = fixture('week3-pregame.json');
const season = fixture('season-2026-proteams.json');
const live = fixture('matchup-week3-live-1141.json');

function fakeResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function fakeFetch(schedule: () => unknown[]): { urls: string[]; fetchImpl: typeof fetch } {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async input => {
    const url = String(input);
    urls.push(url);
    if (url.includes('view=mSettings')) return fakeResponse(league);
    return url.includes('/leagues/') ? fakeResponse({ schedule: schedule() }) : fakeResponse(season);
  };
  return { urls, fetchImpl };
}

async function info() {
  return loadLeagueInfo({ fetchImpl: fakeFetch(() => []).fetchImpl });
}

it('finds the Monday games by their Eastern kickoff day', () => {
  expect(mondayGames(season, 3)).toEqual([{ id: 401872963, date: 1790640900000, home: 'CHI', away: 'PHI' }]);
});

it('keeps only the matchups with an MNF starter, and only those starters', async () => {
  const board = buildBoard(await info(), live.schedule, season, {
    week: 3,
    timeZone: 'America/New_York',
    myTeamId: 1,
    now: 1790640900000 + 60 * 60 * 1000,
  });

  expect(board.matchups.map(m => m.id)).toEqual([13, 14, 16, 17, 18]);
  const names = board.matchups.map(m => [
    ...m.players.me.map(e => m.slate.lanes[e.lane].me.name),
    ...m.players.opp.map(e => m.slate.lanes[e.lane].opp.name),
  ]);
  expect(names).toEqual([
    ['Saquon Barkley'],
    ['DeVonta Smith'],
    ['Zack Baun'],
    ['Colston Loveland', 'Eagles D/ST'],
    ['Jalen Hurts', "D'Andre Swift"],
  ]);
  for (const m of board.matchups) {
    for (const side of ['me', 'opp'] as const) {
      for (const e of m.players[side]) expect(['CHI', 'PHI']).toContain(m.slate.lanes[e.lane][side].team);
    }
  }
});

it('puts your team on the left, labels the rest by owner and counts every starter in the score', async () => {
  const board = buildBoard(await info(), live.schedule, season, {
    week: 3,
    timeZone: 'America/New_York',
    myTeamId: 1,
    now: Date.UTC(2026, 8, 30),
  });

  const mine = board.matchups.find(m => m.mine)!;
  expect(mine.teamIds.me).toBe(1);
  expect(mine.slate.me).toEqual({ name: 'Somethings Gotta Gibbs', owner: 'YOU' });
  expect(mine.slate.opp.owner).toBe('IAN');
  expect(board.matchups.filter(m => m.mine)).toHaveLength(1);

  const other = board.matchups.find(m => m.id === 17)!;
  expect(other.slate.me.owner).toBe('PRANAY');
  expect(other.slate.opp.owner).toBe('CARLOS');
  const snap = snapshotAt(other.slate, 1);
  expect(fmt(snap.totals.me)).toBe('82.8');
  expect(fmt(snap.totals.opp)).toBe('27.7');
});

it('marks no matchup as yours when no team is picked', async () => {
  const board = buildBoard(await info(), live.schedule, season, {
    week: 3,
    timeZone: 'America/New_York',
    myTeamId: null,
    now: 0,
  });

  expect(board.matchups.some(m => m.mine)).toBe(false);
  expect(board.matchups.find(m => m.id === 16)!.slate.me.owner).not.toBe('YOU');
});

it('spans the MNF window on the week timeline', async () => {
  const board = buildBoard(await info(), live.schedule, season, {
    week: 3,
    timeZone: 'America/New_York',
    myTeamId: 1,
    now: 0,
  });

  expect(board.window[1]).toBe(1);
  expect(board.toT(1790640900000)).toBeCloseTo(board.window[0], 9);
  expect(board.window[0]).toBeGreaterThan(0.5);
});

it('loads the board from one matchup read and the pro schedule, and polls only the matchups', async () => {
  let schedule = league.schedule;
  const { urls, fetchImpl } = fakeFetch(() => schedule);
  const leagueInfo = await loadLeagueInfo({ fetchImpl });

  const board = await loadMnfBoard(leagueInfo, { timeZone: 'America/New_York', myTeamId: 1, fetchImpl, now: 0 });
  expect(urls).toHaveLength(3);
  expect(fmt(snapshotAt(board.matchups.find(m => m.id === 17)!.slate, 1).totals.me)).toBe('34.3');

  schedule = live.schedule;
  const next = await pollMnf(leagueInfo, board, { timeZone: 'America/New_York', myTeamId: 1, fetchImpl, now: 0 });
  expect(urls).toHaveLength(4);
  expect(urls[3]).toContain('view=mLiveScoring');
  expect(fmt(snapshotAt(next.matchups.find(m => m.id === 17)!.slate, 1).totals.me)).toBe('82.8');
});
