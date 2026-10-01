import type { Player, Side } from '../model/types';
import type { LeagueInfo } from './load';
import { proTeamsOf } from './slate';
import { PRO_TEAMS } from './proTeams';
import { GAME_MS } from './timeline';
import { buildWeek, type ScheduleEntry, type WeekBoard, type WeekMatchup } from './week';

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

export interface MnfMatchup extends WeekMatchup {
  players: Record<Side, MnfEntry[]>;
}

export interface MnfBoard {
  season: number;
  week: number;
  games: MnfGame[];
  window: [number, number];
  matchups: MnfMatchup[];
  toT(ms: number): number;
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

function playsMonday(p: Player, teams: Set<string>): boolean {
  return p.id !== 'empty' && teams.has(p.team);
}

// Monday night is the week board narrowed to the matchups, and the starters, that the Monday games still move.
export function mnfOf(board: WeekBoard): MnfBoard {
  const games = mondayGames(board.proSeason, board.week);
  const teams = new Set(games.flatMap(g => [g.home, g.away]));

  const matchups: MnfMatchup[] = [];
  if (teams.size > 0) {
    for (const matchup of board.matchups) {
      const players: Record<Side, MnfEntry[]> = { me: [], opp: [] };
      matchup.slate.lanes.forEach((lane, i) => {
        for (const side of ['me', 'opp'] as const) {
          if (playsMonday(lane[side], teams)) players[side].push({ side, lane: i });
        }
      });
      if (players.me.length + players.opp.length > 0) matchups.push({ ...matchup, players });
    }
  }

  const window: [number, number] = games.length
    ? [board.toT(games[0].date), board.toT(games[games.length - 1].date + GAME_MS)]
    : [1, 1];

  return { season: board.season, week: board.week, games, window, matchups, toT: board.toT };
}

export function buildBoard(
  info: LeagueInfo,
  schedule: ScheduleEntry[],
  season: unknown,
  opts: { week: number; timeZone: string; now: number },
): MnfBoard {
  return mnfOf(buildWeek(info, schedule, season, opts));
}
