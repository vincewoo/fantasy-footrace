import type { Slate } from '../model/types';
import { fetchLeague, fetchSeason, SEASON } from './client';
import {
  dstTiers,
  eventsFromPoll,
  readPoll,
  withEvents,
  type DstHistory,
  type PollState,
} from './live';
import { buildSlate, listTeams, posOf, type LeagueTeam } from './slate';
import { fetchSummary, scoresAgainst, yardsAgainst } from './summary';
import { buildTimeline } from './timeline';
import { fetchMatchups, ownerLabel, scheduleOf, weekKickoffs, type ScheduleEntry } from './week';

export interface LeagueInfo {
  week: number;
  name: string;
  teams: LeagueTeam[];
  raw: any;
}

export async function loadLeagueInfo(opts: { fetchImpl?: typeof fetch } = {}): Promise<LeagueInfo> {
  const raw: any = await fetchLeague(['mTeam', 'mSettings'], { fetchImpl: opts.fetchImpl });

  return {
    week: raw.status.currentMatchupPeriod,
    name: raw.settings.name,
    teams: listTeams(raw),
    raw,
  };
}

export interface LiveSlate {
  slate: Slate;
  poll: PollState;
  toT(ms: number): number;
  season: number;
  week: number;
  matchupId: number;
  myTeamId: number;
  oppTeamId: number;
}

function dstStarters(entry: ScheduleEntry, cur: PollState): { id: string; eventId: string; proTeamId: number }[] {
  const found: { id: string; eventId: string; proTeamId: number }[] = [];
  for (const side of [entry.home, entry.away]) {
    const entries = (side as any).rosterForCurrentScoringPeriod?.entries ?? [];
    for (const rosterEntry of entries) {
      if (rosterEntry?.lineupSlotId === 20 || rosterEntry?.lineupSlotId === 21) continue;
      const player = rosterEntry?.playerPoolEntry?.player;
      const id = String(player?.id);
      const actual = cur.actuals[id];
      if (!actual?.eventId || !Number.isFinite(Number(actual.proTeamId))) continue;
      if (posOf(Number(player?.defaultPositionId)) !== 'DST') continue;
      found.push({ id, eventId: actual.eventId, proTeamId: Number(actual.proTeamId) });
    }
  }
  return found;
}

async function dstHistoryOf(
  entry: ScheduleEntry,
  info: LeagueInfo,
  cur: PollState,
  fetchImpl?: typeof fetch,
): Promise<Record<string, DstHistory>> {
  const tiers = dstTiers(info.raw?.settings?.scoringSettings?.scoringItems ?? []);
  const starters = dstStarters(entry, cur);

  const settled = await Promise.all(
    starters.map(async starter => {
      try {
        const summary = await fetchSummary(starter.eventId, { fetchImpl });
        return {
          starter,
          history: {
            tiers,
            ...scoresAgainst(summary, starter.proTeamId),
            drives: yardsAgainst(summary, starter.proTeamId),
          },
        };
      } catch {
        return null;
      }
    }),
  );

  const history: Record<string, DstHistory> = {};
  for (const result of settled) {
    if (result) history[result.starter.id] = result.history;
  }
  return history;
}

export async function loadLiveSlate(
  info: LeagueInfo,
  myTeamId: number,
  opts: { timeZone: string; week?: number; fetchImpl?: typeof fetch; now?: number },
): Promise<LiveSlate> {
  const week = opts.week ?? info.week;
  const [matchup, season] = await Promise.all([
    fetchMatchups(week, opts.fetchImpl),
    fetchSeason(['proTeamSchedules_wl'], { fetchImpl: opts.fetchImpl }),
  ]);

  const schedule = scheduleOf(matchup);
  const entry = schedule.find(
    (m: ScheduleEntry) => m.home.teamId === myTeamId || m.away.teamId === myTeamId,
  );
  if (!entry) throw new Error('no matchup for team ' + myTeamId);

  const base = buildSlate(
    { ...info.raw, scoringPeriodId: week, schedule },
    season,
    myTeamId,
    { timeZone: opts.timeZone },
  );
  const slate = { ...base, me: { ...base.me, owner: ownerLabel(info, myTeamId) } };

  const timeline = buildTimeline(weekKickoffs(season, week), opts.timeZone);
  const cur = readPoll(schedule, myTeamId, week);
  const history = await dstHistoryOf(entry, info, cur, opts.fetchImpl);
  const seed = eventsFromPoll(
    slate,
    null,
    cur,
    timeline.toT(opts.now ?? Date.now()),
    1,
    history,
  );

  return {
    slate: withEvents(slate, seed),
    poll: cur,
    toT: timeline.toT,
    season: SEASON,
    week,
    matchupId: entry.id,
    myTeamId,
    oppTeamId: entry.home.teamId === myTeamId ? entry.away.teamId : entry.home.teamId,
  };
}

export async function pollLive(
  info: LeagueInfo,
  live: LiveSlate,
  opts: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<LiveSlate> {
  const schedule = scheduleOf(await fetchMatchups(live.week, opts.fetchImpl));

  const cur = readPoll(schedule, live.myTeamId, live.week);
  const maxId = live.slate.events.reduce((max, e) => Math.max(max, e.id), 0);
  const events = eventsFromPoll(
    live.slate,
    live.poll,
    cur,
    live.toT(opts.now ?? Date.now()),
    maxId + 1,
  );

  return { ...live, slate: withEvents(live.slate, events), poll: cur };
}
