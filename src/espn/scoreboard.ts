import type { Slate } from '../model/types';
import { proTeamById } from './proTeams';

export interface GameStatus {
  state: 'pre' | 'in' | 'post';
  name: string;
  period: number;
  displayClock: string;
  shortDetail: string;
  completed: boolean;
}

const SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

export function scoreboardUrl(season: number, week: number): string {
  return `${SITE_BASE}?seasontype=2&week=${week}&dates=${season}`;
}

export async function fetchScoreboard(
  season: number,
  week: number,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<unknown> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = scoreboardUrl(season, week);

  let response: Response;
  try {
    response = await doFetch(url, { method: 'GET', credentials: 'omit' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`ESPN scoreboard request to ${url} failed: ${detail}`);
  }

  if (!response.ok) {
    throw new Error(`ESPN scoreboard request to ${url} failed with HTTP ${response.status}`);
  }

  return response.json();
}

function statusOf(competition: any): GameStatus | null {
  const status = competition?.status;
  const type = status?.type;
  if (!type) return null;

  return {
    state: type.state === 'in' || type.state === 'post' ? type.state : 'pre',
    name: String(type.name ?? ''),
    period: Number(status.period) || 0,
    displayClock: String(status.displayClock ?? ''),
    shortDetail: String(type.shortDetail ?? ''),
    completed: type.completed === true,
  };
}

export function statusesByTeam(scoreboard: any): Record<string, GameStatus> {
  const out: Record<string, GameStatus> = {};

  for (const event of scoreboard?.events ?? []) {
    const status = statusOf(event?.competitions?.[0]);
    if (!status) continue;

    for (const competitor of event?.competitions?.[0]?.competitors ?? []) {
      const id = Number(competitor?.team?.id);
      if (!Number.isFinite(id)) continue;

      let abbrev: string;
      try {
        abbrev = proTeamById(id).abbrev;
      } catch {
        continue;
      }
      out[abbrev] = status;
    }
  }

  return out;
}

export function gameLabel(s: GameStatus): string | null {
  if (s.state === 'post') return s.completed ? 'FINAL' : s.shortDetail.toUpperCase();
  if (s.state === 'pre') return null;
  if (s.name === 'STATUS_HALFTIME') return 'HALF';
  if (s.name === 'STATUS_END_PERIOD') return s.period >= 5 ? 'END OT' : `END Q${s.period}`;
  if (s.state !== 'in') return null;
  return s.period >= 5 ? `OT ${s.displayClock}` : `Q${s.period} ${s.displayClock}`;
}

export function withGameStatus(
  slate: Slate,
  statuses: Record<string, GameStatus>,
  liveT: number,
): Slate {
  return {
    ...slate,
    statusLabel: (p, t) => {
      if (t >= liveT - 0.002) {
        const status = statuses[p.team];
        const label = status ? gameLabel(status) : null;
        if (label !== null) return label;
      }
      return slate.statusLabel(p, t);
    },
  };
}
