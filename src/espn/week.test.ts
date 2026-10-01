import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { fmt, snapshotAt } from '../model/derive';
import { loadLeagueInfo } from './load';
import { buildWeek, loadWeek, pollWeek } from './week';

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

it('builds every matchup of the week from the home side, owners named on both', async () => {
  const leagueInfo = await info();
  const board = buildWeek(leagueInfo, live.schedule, season, { week: 3, timeZone: 'America/New_York', now: 0 });

  expect(board.matchups.map(m => m.id)).toEqual(live.schedule.map((e: any) => e.id));
  expect(board.matchups).toHaveLength(leagueInfo.teams.length / 2);
  const teams = board.matchups.flatMap(m => [m.teamIds.me, m.teamIds.opp]).sort((a, b) => a - b);
  expect(teams).toEqual(leagueInfo.teams.map(t => t.id).sort((a, b) => a - b));
  for (const m of board.matchups) {
    expect(m.slate.me.owner).not.toBe('YOU');
    expect(m.slate.me.owner).toBe(m.slate.me.owner.toUpperCase());
    expect(m.slate.opp.owner.length).toBeGreaterThan(0);
  }
  expect(board.matchups.find(m => m.id === 17)!.slate.me.owner).toBe('PRANAY');
});

it('loads from one matchup read and the pro schedule, and polls only the matchups', async () => {
  let schedule = league.schedule;
  const { urls, fetchImpl } = fakeFetch(() => schedule);
  const leagueInfo = await loadLeagueInfo({ fetchImpl });

  const board = await loadWeek(leagueInfo, { timeZone: 'America/New_York', fetchImpl, now: 0 });
  expect(urls).toHaveLength(3);
  expect(board.week).toBe(3);
  expect(fmt(snapshotAt(board.matchups.find(m => m.id === 17)!.slate, 1).totals.me)).toBe('34.3');

  schedule = live.schedule;
  const next = await pollWeek(leagueInfo, board, { timeZone: 'America/New_York', fetchImpl, now: 0 });
  expect(urls).toHaveLength(4);
  expect(urls[3]).toContain('view=mLiveScoring');
  expect(fmt(snapshotAt(next.matchups.find(m => m.id === 17)!.slate, 1).totals.me)).toBe('82.8');
});
