import type { Slate } from '../model/types';
import { fetchLeague, fetchSeason } from './client';
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
  toT(ms: number): number;
}

function weekKickoffs(season: any, week: number): number[] {
  const dates: number[] = [];
  for (const team of proTeamsOf(season)) {
    for (const game of team.proGamesByScoringPeriod?.[String(week)] ?? []) dates.push(game.date);
  }
  return dates;
}

export async function loadLiveSlate(
  info: LeagueInfo,
  myTeamId: number,
  opts: { timeZone: string; fetchImpl?: typeof fetch },
): Promise<LiveSlate> {
  const [matchup, season] = await Promise.all([
    fetchLeague(['mMatchupScore', 'mScoreboard', 'mLiveScoring'], {
      scoringPeriodId: info.week,
      filter: { schedule: { filterMatchupPeriodIds: { value: [info.week] } } },
      fetchImpl: opts.fetchImpl,
    }),
    fetchSeason(['proTeamSchedules_wl'], { fetchImpl: opts.fetchImpl }),
  ]);

  const slate = buildSlate(
    { ...info.raw, scoringPeriodId: info.week, schedule: (matchup as any)?.schedule },
    season,
    myTeamId,
    { timeZone: opts.timeZone },
  );

  const timeline = buildTimeline(weekKickoffs(season, info.week), opts.timeZone);

  return { slate, toT: timeline.toT };
}
