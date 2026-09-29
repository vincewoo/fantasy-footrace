import type { Player, Side, Slate } from '../model/types';
import { fetchLeague, fetchSeason, SEASON } from './client';
import { eventsFromPoll, readPoll, withEvents } from './live';
import type { LeagueInfo } from './load';
import { buildSlate, proTeamsOf } from './slate';
import { PRO_TEAMS } from './proTeams';
import { buildTimeline, GAME_MS } from './timeline';

// NFL kickoffs are scheduled in Eastern time, so a Monday game is one that kicks off on an Eastern Monday.
const NFL_TZ = 'America/New_York';

export interface MnfGame {
  id: number;
  date: number;
  home: string;
  away: string;
}

export interface MnfEntry {
  side: Side;
  lane: number;
}

export interface MnfMatchup {
  id: number;
  teamIds: Record<Side, number>;
  mine: boolean;
  slate: Slate;
  players: Record<Side, MnfEntry[]>;
}

export interface MnfBoard {
  season: number;
  week: number;
  games: MnfGame[];
  window: [number, number];
  matchups: MnfMatchup[];
  toT(ms: number): number;
  proSeason: unknown;
}

interface ScheduleEntry {
  id: number;
  home: { teamId: number };
  away: { teamId: number };
}

function isMonday(ms: number): boolean {
  return new Intl.DateTimeFormat('en-US', { timeZone: NFL_TZ, weekday: 'short' }).format(new Date(ms)) === 'Mon';
}

export function mondayGames(season: unknown, week: number): MnfGame[] {
  const games = new Map<number, MnfGame>();
  for (const team of proTeamsOf(season)) {
    for (const game of team.proGamesByScoringPeriod?.[String(week)] ?? []) {
      if (games.has(game.id) || !isMonday(game.date)) continue;
      games.set(game.id, {
        id: game.id,
        date: game.date,
        home: PRO_TEAMS[game.homeProTeamId]?.abbrev ?? '',
        away: PRO_TEAMS[game.awayProTeamId]?.abbrev ?? '',
      });
    }
  }
  return [...games.values()].sort((a, b) => a.date - b.date);
}

function weekKickoffs(season: unknown, week: number): number[] {
  const dates: number[] = [];
  for (const team of proTeamsOf(season)) {
    for (const game of team.proGamesByScoringPeriod?.[String(week)] ?? []) dates.push(game.date);
  }
  return dates;
}

function fetchMatchups(week: number, fetchImpl?: typeof fetch): Promise<unknown> {
  return fetchLeague(['mMatchupScore', 'mScoreboard', 'mLiveScoring'], {
    scoringPeriodId: week,
    filter: { schedule: { filterMatchupPeriodIds: { value: [week] } } },
    fetchImpl,
  });
}

function scheduleOf(matchup: unknown): ScheduleEntry[] {
  return ((matchup as { schedule?: ScheduleEntry[] } | null)?.schedule ?? []) as ScheduleEntry[];
}

function playsMonday(p: Player, teams: Set<string>): boolean {
  return p.id !== 'empty' && teams.has(p.team);
}

export function buildBoard(
  info: LeagueInfo,
  schedule: ScheduleEntry[],
  season: unknown,
  opts: { week: number; timeZone: string; myTeamId: number | null; now: number },
): MnfBoard {
  const games = mondayGames(season, opts.week);
  const teams = new Set(games.flatMap(g => [g.home, g.away]));
  const timeline = buildTimeline(weekKickoffs(season, opts.week), opts.timeZone);
  const tNow = timeline.toT(opts.now);
  const owners = new Map(info.teams.map(t => [t.id, t.owner]));
  const ownerLabel = (id: number) =>
    id === opts.myTeamId ? 'YOU' : (owners.get(id) ?? '').toUpperCase();

  const matchups: MnfMatchup[] = [];
  if (teams.size > 0) {
    for (const entry of schedule) {
      if (!entry?.home || !entry?.away) continue;
      const mine = entry.away.teamId === opts.myTeamId;
      const meId = mine ? entry.away.teamId : entry.home.teamId;
      const oppId = mine ? entry.home.teamId : entry.away.teamId;

      const base = buildSlate({ ...info.raw, scoringPeriodId: opts.week, schedule }, season, meId, {
        timeZone: opts.timeZone,
      });
      const cur = readPoll(schedule, meId, opts.week);
      const slate = withEvents(
        {
          ...base,
          me: { ...base.me, owner: ownerLabel(meId) },
          opp: { ...base.opp, owner: ownerLabel(oppId) },
        },
        eventsFromPoll(base, null, cur, tNow, 1),
      );

      const players: Record<Side, MnfEntry[]> = { me: [], opp: [] };
      slate.lanes.forEach((lane, i) => {
        for (const side of ['me', 'opp'] as const) {
          if (playsMonday(lane[side], teams)) players[side].push({ side, lane: i });
        }
      });
      if (players.me.length + players.opp.length === 0) continue;

      matchups.push({
        id: entry.id,
        teamIds: { me: meId, opp: oppId },
        mine: meId === opts.myTeamId || oppId === opts.myTeamId,
        slate,
        players,
      });
    }
  }

  const window: [number, number] = games.length
    ? [timeline.toT(games[0].date), timeline.toT(games[games.length - 1].date + GAME_MS)]
    : [1, 1];

  return {
    season: SEASON,
    week: opts.week,
    games,
    window,
    matchups,
    toT: timeline.toT,
    proSeason: season,
  };
}

export async function loadMnfBoard(
  info: LeagueInfo,
  opts: { timeZone: string; week?: number; myTeamId?: number | null; fetchImpl?: typeof fetch; now?: number },
): Promise<MnfBoard> {
  const week = opts.week ?? info.week;
  const [matchup, season] = await Promise.all([
    fetchMatchups(week, opts.fetchImpl),
    fetchSeason(['proTeamSchedules_wl'], { fetchImpl: opts.fetchImpl }),
  ]);

  return buildBoard(info, scheduleOf(matchup), season, {
    week,
    timeZone: opts.timeZone,
    myTeamId: opts.myTeamId ?? null,
    now: opts.now ?? Date.now(),
  });
}

// A poll rebuilds every matchup from the fresh box scores; the pro schedule is fixed for the week.
export async function pollMnf(
  info: LeagueInfo,
  board: MnfBoard,
  opts: { timeZone: string; myTeamId?: number | null; fetchImpl?: typeof fetch; now?: number },
): Promise<MnfBoard> {
  const schedule = scheduleOf(await fetchMatchups(board.week, opts.fetchImpl));
  return buildBoard(info, schedule, board.proSeason, {
    week: board.week,
    timeZone: opts.timeZone,
    myTeamId: opts.myTeamId ?? null,
    now: opts.now ?? Date.now(),
  });
}
