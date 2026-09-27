import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { fmt, snapshotAt } from '../model/derive';
import { LEAGUE_ID, SEASON } from './client';
import { loadLeagueInfo, loadLiveSlate, pollLive } from './load';

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
      : fakeResponse(fixture('season-2026-proteams.json'));
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

it('reports the room identity of the viewer\u2019s matchup', async () => {
  const { fetchImpl } = fakeFetch();
  const info = await loadLeagueInfo({ fetchImpl });

  const result = await loadLiveSlate(info, 1, { timeZone: 'America/New_York', fetchImpl });

  expect(result.matchupId).toBe(16);
  expect(result.myTeamId).toBe(1);
  expect(result.oppTeamId).toBe(10);
  expect(result.week).toBe(3);
  expect(result.season).toBe(2026);
});

const NOW = 1790528400000;
const TZ = 'America/New_York';

function matchupFetch(schedule: unknown): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return fakeResponse({ schedule });
  };
  return { calls, fetchImpl };
}

const scheduleCopy = (): any => JSON.parse(JSON.stringify(league.schedule));

function patchPlayer(schedule: any, name: string, edit: (actual: any) => void): void {
  for (const side of ['home', 'away']) {
    for (const entry of schedule.flatMap((m: any) => [m[side].rosterForCurrentScoringPeriod.entries])) {
      const player = entry.map((e: any) => e.playerPoolEntry.player).find((p: any) => p.fullName === name);
      if (!player) continue;
      edit(
        player.stats.find(
          (s: any) => s.statSourceId === 0 && s.statSplitTypeId === 1 && s.scoringPeriodId === 3,
        ),
      );
    }
  }
}

it('seeds the events ESPN’s actual points describe for games already played', async () => {
  const { fetchImpl } = fakeFetch();
  const info = await loadLeagueInfo({ fetchImpl });

  const result = await loadLiveSlate(info, 6, { timeZone: TZ, fetchImpl, now: NOW });
  const tNow = result.toT(NOW);
  const snap = snapshotAt(result.slate, tNow);

  expect(result.slate.events).toHaveLength(21);
  expect(result.slate.events.map(e => e.id)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  expect(result.slate.events.every(e => e.side === 'me')).toBe(true);
  expect(fmt(snap.totals.me)).toBe('41.6');
  expect(fmt(snap.totals.opp)).toBe('0.0');

  const first = result.slate.events[0];
  expect([first.kind, first.text]).toEqual(['pass', 'Love completes 39 yds']);
  expect(Number(first.t.toFixed(6))).toBe(0.016746);

  expect(result.poll.actuals['4036378'].total).toBe(18.48);
});

it('seeds a ruled-out starter with one injury event at his kickoff', async () => {
  const { fetchImpl } = fakeFetch();
  const info = await loadLeagueInfo({ fetchImpl });

  const result = await loadLiveSlate(info, 14, { timeZone: TZ, fetchImpl, now: NOW });

  const injuries = result.slate.events.filter(e => e.kind === 'injury');
  expect(injuries).toHaveLength(1);

  const [injury] = injuries;
  const lane = result.slate.lanes[injury.lane];
  expect([injury.side, injury.text, injury.pts, injury.yds]).toEqual(['me', 'Lloyd ruled OUT', 0, 0]);
  expect(injury.t).toBe(lane[injury.side].window[0]);
  expect(injury.t).toBe(result.toT(NOW));
});

it('polls the matchup again and adds nothing when the scores are unchanged', async () => {
  const { fetchImpl } = fakeFetch();
  const info = await loadLeagueInfo({ fetchImpl });
  const live = await loadLiveSlate(info, 6, { timeZone: TZ, fetchImpl, now: NOW });

  const { calls, fetchImpl: pollFetch } = matchupFetch(league.schedule);
  const next = await pollLive(info, live, { fetchImpl: pollFetch, now: NOW });

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(
    `/espn${LEAGUE_PATH}?view=mMatchupScore&view=mScoreboard&view=mLiveScoring&scoringPeriodId=3`,
  );
  expect(headersOf(calls[0])['X-Fantasy-Filter']).toBe(
    '{"schedule":{"filterMatchupPeriodIds":{"value":[3]}}}',
  );
  expect(next.slate.events).toHaveLength(21);
  expect(next.poll).toEqual(live.poll);
});

it('turns the points scored since the last poll into events at the current time', async () => {
  const { fetchImpl } = fakeFetch();
  const info = await loadLeagueInfo({ fetchImpl });
  const live = await loadLiveSlate(info, 6, { timeZone: TZ, fetchImpl, now: NOW });
  const tNow = live.toT(NOW);

  const schedule = scheduleCopy();
  patchPlayer(schedule, 'Jordan Love', (actual: any) => {
    actual.stats['3'] = 342;
    actual.appliedStats['3'] = 13.68;
    actual.appliedTotal = 19.68;
  });
  const { fetchImpl: pollFetch } = matchupFetch(schedule);

  const next = await pollLive(info, live, { fetchImpl: pollFetch, now: NOW });
  const added = next.slate.events.slice(21);

  expect(added).toHaveLength(2);
  expect(added.map(e => [e.id, e.kind, e.yds, e.pts])).toEqual([
    [22, 'pass', 15, 0.6],
    [23, 'pass', 15, 0.6],
  ]);
  expect(added.every(e => e.t > tNow && e.t < tNow + 1e-5)).toBe(true);
  expect(added.every(e => e.text === 'Love completes 15 yds')).toBe(true);
  expect(next.slate.events.slice(0, 21)).toEqual(live.slate.events);
  expect(next.poll.actuals['4036378'].total).toBe(19.68);
  expect(fmt(snapshotAt(next.slate, tNow + 1e-5).totals.me)).toBe('42.8');
});
