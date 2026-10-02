import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { fmt, snapshotAt } from '../model/derive';
import { LEAGUE_ID, SEASON } from './client';
import { loadLeagueInfo, loadLiveSlate, pollLive } from './load';
import { summaryUrl } from './summary';

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
  expect(info.teams[0]).toEqual({ id: 1, name: 'Somethings Gotta Gibbs', owner: 'tejas & Vince' });
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
  expect(result.slate.me).toEqual({ name: 'Somethings Gotta Gibbs', owner: 'TEJAS & VINCE' });
  expect(result.slate.events).toEqual([]);
  expect(Number(result.toT(1790528400000).toFixed(6))).toBe(0.200957);
});

it('loads an earlier week for a replay when asked for one', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const info = await loadLeagueInfo({ fetchImpl });

  const result = await loadLiveSlate(info, 1, { timeZone: 'America/New_York', week: 2, fetchImpl });

  expect(calls[1].url).toBe(
    `/espn${LEAGUE_PATH}?view=mMatchupScore&view=mScoreboard&view=mLiveScoring&scoringPeriodId=2`,
  );
  expect(headersOf(calls[1])['X-Fantasy-Filter']).toBe(
    '{"schedule":{"filterMatchupPeriodIds":{"value":[2]}}}',
  );
  expect(result.week).toBe(2);
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

  expect(added).toHaveLength(1);
  expect(added.map(e => [e.id, e.kind, e.yds, e.pts])).toEqual([
    [22, 'pass', 30, 1.2],
  ]);
  expect(added.every(e => e.t > tNow && e.t < tNow + 1e-5)).toBe(true);
  expect(added.every(e => e.text === 'Love completes 30 yds')).toBe(true);
  expect(next.slate.events.slice(0, 21)).toEqual(live.slate.events);
  expect(next.poll.actuals['4036378'].total).toBe(19.68);
  expect(fmt(snapshotAt(next.slate, tNow + 1e-5).totals.me)).toBe('42.8');
});

const liveMatchup = fixture('matchup-week3-live-1047.json');
const summaryFixture = fixture('summary-401872950-live.json');
const LIVE_NOW = 1790531264000;
const BENGALS = '-16004';

function liveFetch(summary: 'ok' | 'fail'): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('view=mSettings')) return fakeResponse(league);
    if (url.includes('site.api.espn.com')) {
      if (summary === 'fail' || !url.includes('event=401872950')) {
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
      }
      return fakeResponse(summaryFixture);
    }
    if (url.includes('/leagues/')) {
      return fakeResponse(url.includes('view=mMatchupScore') ? liveMatchup : { schedule: league.schedule });
    }
    return fakeResponse(fixture('season-2026-proteams.json'));
  };
  return { calls, fetchImpl };
}

const laneOfDst = (result: Awaited<ReturnType<typeof loadLiveSlate>>): number =>
  result.slate.lanes.findIndex(lane => lane.opp.name === 'Bengals D/ST');

const shown = (events: { t: number; pts: number; text: string }[]): string[] =>
  events.map(e => `${Number(e.t.toFixed(6))} ${e.pts} ${e.text}`);

it('rebuilds a D/ST’s scores allowed from the NFL game summary on load', async () => {
  const { calls, fetchImpl } = liveFetch('ok');
  const info = await loadLeagueInfo({ fetchImpl });

  const result = await loadLiveSlate(info, 1, { timeZone: TZ, fetchImpl, now: LIVE_NOW });
  const lane = laneOfDst(result);
  const def = result.slate.events.filter(e => e.lane === lane && e.side === 'opp');

  expect(lane).toBe(8);
  expect(shown(def)).toEqual([
    '0.200957 10 Bengals D/ST take the field',
    '0.205666 -2 Bengals D/ST allow a score (7 allowed)',
    '0.237259 -2 Bengals D/ST allow a score (14 allowed)',
    '0.237259 -2 Bengals D/ST give up yards (159 allowed)',
  ]);
  expect(def.every(e => e.kind === 'rush')).toBe(true);
  expect(def.reduce((total, e) => total + e.pts, 0)).toBe(4);
  expect(result.poll.actuals[BENGALS].total).toBe(4);

  expect(calls.some(c => c.url === summaryUrl('401872950'))).toBe(true);
});

it('fetches the summary of every D/ST in the matchup in parallel', async () => {
  const { calls, fetchImpl } = liveFetch('ok');
  const info = await loadLeagueInfo({ fetchImpl });

  const result = await loadLiveSlate(info, 1, { timeZone: TZ, fetchImpl, now: LIVE_NOW });
  const urls = calls.filter(c => c.url.includes('site.api.espn.com')).map(c => c.url);
  const firstSummary = calls.findIndex(c => c.url.includes('site.api.espn.com'));

  expect(urls).toEqual([summaryUrl('401872950'), summaryUrl('401872956')]);
  expect(firstSummary).toBe(3);

  const giants = result.slate.events.filter(e => e.lane === 8 && e.side === 'me');
  expect(shown(giants)).toEqual([
    '0.216183 2 Giants D/ST recover a fumble',
    '0.231409 10 Giants D/ST tighten up',
  ]);
});

it('falls back to one adjustment event for a D/ST whose summary fails', async () => {
  const { fetchImpl } = liveFetch('fail');
  const info = await loadLeagueInfo({ fetchImpl });

  const result = await loadLiveSlate(info, 1, { timeZone: TZ, fetchImpl, now: LIVE_NOW });
  const def = result.slate.events.filter(e => e.lane === laneOfDst(result) && e.side === 'opp');

  expect(shown(def)).toEqual(['0.223796 4 Bengals D/ST tighten up']);
});

it('keeps later polls on the D/ST’s own schedule', async () => {
  const { fetchImpl } = liveFetch('ok');
  const info = await loadLeagueInfo({ fetchImpl });
  const live = await loadLiveSlate(info, 1, { timeZone: TZ, fetchImpl, now: LIVE_NOW });

  const schedule = JSON.parse(JSON.stringify(liveMatchup.schedule));
  for (const side of ['home', 'away']) {
    for (const match of schedule) {
      const entry = match[side].rosterForCurrentScoringPeriod.entries
        .find((e: any) => String(e.playerPoolEntry.player.id) === BENGALS);
      if (!entry) continue;
      const actual = entry.playerPoolEntry.player.stats.find(
        (s: any) => s.statSourceId === 0 && s.statSplitTypeId === 1 && s.scoringPeriodId === 3,
      );
      actual.stats['99'] = 1;
      actual.appliedStats['99'] = 1;
      actual.appliedTotal = 5;
    }
  }
  const { calls, fetchImpl: pollFetch } = matchupFetch(schedule);

  const next = await pollLive(info, live, { fetchImpl: pollFetch, now: LIVE_NOW });
  const added = next.slate.events.filter(e => !live.slate.events.includes(e));

  expect(calls).toHaveLength(1);
  expect(calls[0].url).not.toContain('site.api.espn.com');
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ lane: 8, side: 'opp', kind: 'sack', pts: 1 });
  expect(added[0].t).toBeGreaterThan(live.toT(LIVE_NOW));
});

it('shows ESPN’s matchup win probability from each poll instead of the local model', async () => {
  const { fetchImpl } = fakeFetch();
  const info = await loadLeagueInfo({ fetchImpl });
  const live = await loadLiveSlate(info, 6, { timeZone: TZ, fetchImpl, now: NOW });
  const tNow = live.toT(NOW);

  expect(live.slate.odds).toEqual([{ t: tNow, me: 0.48 }]);
  expect(snapshotAt(live.slate, tNow).winPct).toBe(48);

  const schedule = scheduleCopy();
  const entry = schedule.find((m: any) => m.away.teamId === 6);
  entry.away.winProbability = 0.71;
  const later = NOW + 600000;
  const next = await pollLive(info, live, { fetchImpl: matchupFetch(schedule).fetchImpl, now: later });

  expect(snapshotAt(next.slate, live.toT(later)).winPct).toBe(71);
  expect(snapshotAt(next.slate, tNow).winPct).toBe(48);
});
