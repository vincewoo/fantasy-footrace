import type { Slate } from '../model/types';
import { fetchLeague, fetchSeason, SEASON } from './client';
import { eventsFromPoll, readPoll, withEvents, type PollState } from './live';
import { buildSlate, listTeams, proTeamsOf, type LeagueTeam } from './slate';
import { buildTimeline } from './timeline';

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

interface ScheduleEntry {
  id: number;
  home: { teamId: number };
  away: { teamId: number };
}

function weekKickoffs(season: any, week: number): number[] {
  const dates: number[] = [];
  for (const team of proTeamsOf(season)) {
    for (const game of team.proGamesByScoringPeriod?.[String(week)] ?? []) dates.push(game.date);
  }
  return dates;
}

function fetchMatchup(week: number, fetchImpl?: typeof fetch): Promise<unknown> {
  return fetchLeague(['mMatchupScore', 'mScoreboard', 'mLiveScoring'], {
    scoringPeriodId: week,
    filter: { schedule: { filterMatchupPeriodIds: { value: [week] } } },
    fetchImpl,
  });
}

function scheduleOf(matchup: unknown): ScheduleEntry[] {
  return ((matchup as { schedule?: ScheduleEntry[] } | null)?.schedule ?? []) as ScheduleEntry[];
}

export async function loadLiveSlate(
  info: LeagueInfo,
  myTeamId: number,
  opts: { timeZone: string; fetchImpl?: typeof fetch; now?: number },
): Promise<LiveSlate> {
  const [matchup, season] = await Promise.all([
    fetchMatchup(info.week, opts.fetchImpl),
    fetchSeason(['proTeamSchedules_wl'], { fetchImpl: opts.fetchImpl }),
  ]);

  const schedule = scheduleOf(matchup);
  const entry = schedule.find(
    (m: ScheduleEntry) => m.home.teamId === myTeamId || m.away.teamId === myTeamId,
  );
  if (!entry) throw new Error('no matchup for team ' + myTeamId);

  const slate = buildSlate(
    { ...info.raw, scoringPeriodId: info.week, schedule },
    season,
    myTeamId,
    { timeZone: opts.timeZone },
  );

  const timeline = buildTimeline(weekKickoffs(season, info.week), opts.timeZone);
  const cur = readPoll(schedule, myTeamId, info.week);
  const seed = eventsFromPoll(slate, null, cur, timeline.toT(opts.now ?? Date.now()), 1);

  return {
    slate: withEvents(slate, seed),
    poll: cur,
    toT: timeline.toT,
    season: SEASON,
    week: info.week,
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
  const schedule = scheduleOf(await fetchMatchup(info.week, opts.fetchImpl));

  const cur = readPoll(schedule, live.myTeamId, info.week);
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
