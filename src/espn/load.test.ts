import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { LEAGUE_ID, SEASON } from './client';
import { loadLeagueInfo, loadLiveSlate } from './load';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

const league = fixture('week3-pregame.json');
const LEAGUE_PATH = `/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${LEAGUE_ID}`;

type Call = { url: string; init: RequestInit | undefined };

function fakeResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function fakeFetch(): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('view=mSettings')) return fakeResponse(league);
    return url.includes('/leagues/')
      ? fakeResponse({ schedule: league.schedule })
      : fakeResponse(fixture('season-proteams-week3.json'));
  };
  return { calls, fetchImpl };
}

function headersOf(call: Call): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

it('loads the league info from one mTeam+mSettings call', async () => {
  const { calls, fetchImpl } = fakeFetch();

  const info = await loadLeagueInfo({ fetchImpl });

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(`/espn${LEAGUE_PATH}?view=mTeam&view=mSettings`);
  expect(info.week).toBe(3);
  expect(info.name).toBe('#fpandfriends');
  expect(info.teams).toHaveLength(12);
  expect(info.teams[0]).toEqual({ id: 1, name: 'Somethings Gotta Gibbs', owner: 'tejas' });
});

it('loads the live slate from the matchup, the player pool and the real kickoffs', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const info = await loadLeagueInfo({ fetchImpl });

  const result = await loadLiveSlate(info, 1, { timeZone: 'America/New_York', fetchImpl });

  const matchup = calls[1];
  const season = calls[2];
  expect(matchup.url).toBe(
    `/espn${LEAGUE_PATH}?view=mMatchupScore&view=mScoreboard&view=mLiveScoring&scoringPeriodId=3`,
  );
  expect(headersOf(matchup)['X-Fantasy-Filter']).toBe(
    '{"schedule":{"filterMatchupPeriodIds":{"value":[3]}}}',
  );
  expect(season.url).toBe(`/espn/apis/v3/games/ffl/seasons/${SEASON}?view=proTeamSchedules_wl`);

  expect(result.slate.lanes).toHaveLength(10);
  expect(`${result.slate.lanes[0].me.name} | ${result.slate.lanes[0].opp.name}`).toBe(
    'Jared Goff | Dak Prescott',
  );
  expect(`${result.slate.lanes[8].me.name} | ${result.slate.lanes[8].opp.name}`).toBe(
    'Giants D/ST | Bengals D/ST',
  );
  expect(result.slate.me).toEqual({ name: 'Somethings Gotta Gibbs', owner: 'YOU' });
  expect(result.slate.events).toEqual([]);
  expect(Number(result.toT(1790528400000).toFixed(6))).toBe(0.200957);
});
