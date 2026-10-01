import type { Side, Slate } from '../model/types';
import { fetchLeague, fetchSeason, SEASON } from './client';
import { eventsFromPoll, readPoll, withEvents } from './live';
import type { LeagueInfo } from './load';
import { buildSlate, proTeamsOf } from './slate';
import { buildTimeline } from './timeline';

export interface WeekMatchup {
  id: number;
  teamIds: Record<Side, number>;
  slate: Slate;
}

// Every matchup of one week, each seen from its home team, which sits on the left.
export interface WeekBoard {
  season: number;
  week: number;
  matchups: WeekMatchup[];
  toT(ms: number): number;
  proSeason: unknown;
}

export interface ScheduleEntry {
  id: number;
  home: { teamId: number };
  away: { teamId: number };
}

export function weekKickoffs(season: unknown, week: number): number[] {
  const dates: number[] = [];
  for (const team of proTeamsOf(season)) {
    for (const game of team.proGamesByScoringPeriod?.[String(week)] ?? []) dates.push(game.date);
  }
  return dates;
}

export function fetchMatchups(week: number, fetchImpl?: typeof fetch): Promise<unknown> {
  return fetchLeague(['mMatchupScore', 'mScoreboard', 'mLiveScoring'], {
    scoringPeriodId: week,
    filter: { schedule: { filterMatchupPeriodIds: { value: [week] } } },
    fetchImpl,
  });
}

export function scheduleOf(matchup: unknown): ScheduleEntry[] {
  return ((matchup as { schedule?: ScheduleEntry[] } | null)?.schedule ?? []) as ScheduleEntry[];
}

// The owner label a slate shows for a team, since nobody on the scoreboard is "you".
export function ownerLabel(info: LeagueInfo, teamId: number): string {
  return (info.teams.find(t => t.id === teamId)?.owner ?? '').toUpperCase();
}

export function buildWeek(
  info: LeagueInfo,
  schedule: ScheduleEntry[],
  season: unknown,
  opts: { week: number; timeZone: string; now: number },
): WeekBoard {
  const timeline = buildTimeline(weekKickoffs(season, opts.week), opts.timeZone);
  const tNow = timeline.toT(opts.now);

  const matchups: WeekMatchup[] = [];
  for (const entry of schedule) {
    if (!entry?.home || !entry?.away) continue;
    const meId = entry.home.teamId;
    const oppId = entry.away.teamId;

    const base = buildSlate({ ...info.raw, scoringPeriodId: opts.week, schedule }, season, meId, {
      timeZone: opts.timeZone,
    });
    const cur = readPoll(schedule, meId, opts.week);
    const slate = withEvents(
      {
        ...base,
        me: { ...base.me, owner: ownerLabel(info, meId) },
        opp: { ...base.opp, owner: ownerLabel(info, oppId) },
      },
      eventsFromPoll(base, null, cur, tNow, 1),
    );

    matchups.push({ id: entry.id, teamIds: { me: meId, opp: oppId }, slate });
  }

  return { season: SEASON, week: opts.week, matchups, toT: timeline.toT, proSeason: season };
}

export async function loadWeek(
  info: LeagueInfo,
  opts: { timeZone: string; week?: number; fetchImpl?: typeof fetch; now?: number },
): Promise<WeekBoard> {
  const week = opts.week ?? info.week;
  const [matchup, season] = await Promise.all([
    fetchMatchups(week, opts.fetchImpl),
    fetchSeason(['proTeamSchedules_wl'], { fetchImpl: opts.fetchImpl }),
  ]);

  return buildWeek(info, scheduleOf(matchup), season, { week, timeZone: opts.timeZone, now: opts.now ?? Date.now() });
}

// A poll rebuilds every matchup from the fresh box scores; the pro schedule is fixed for the week.
export async function pollWeek(
  info: LeagueInfo,
  board: WeekBoard,
  opts: { timeZone: string; fetchImpl?: typeof fetch; now?: number },
): Promise<WeekBoard> {
  const schedule = scheduleOf(await fetchMatchups(board.week, opts.fetchImpl));
  return buildWeek(info, schedule, board.proSeason, {
    week: board.week,
    timeZone: opts.timeZone,
    now: opts.now ?? Date.now(),
  });
}
