import { EspnError } from './client';

const SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';

export function summaryUrl(eventId: string): string {
  return `${SITE_BASE}?event=${eventId}`;
}

export async function fetchSummary(
  eventId: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<unknown> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = summaryUrl(eventId);

  let response: Response;
  try {
    response = await doFetch(url, { method: 'GET', credentials: 'omit' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EspnError(`ESPN summary request to ${url} failed: ${detail}`, 0, 'network');
  }

  if (!response.ok) {
    throw new EspnError(`ESPN summary request to ${url} failed with HTTP ${response.status}`, response.status, 'http');
  }

  return response.json();
}

export function gameProgress(period: number, clock: string): number {
  const [minutes, seconds] = String(clock).split(':');
  const played = (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
  return Math.min(1, ((period - 1) * 900 + (900 - played)) / 3600);
}

export interface ScoreAgainst {
  g: number;
  pa: number;
}

export function scoresAgainst(
  summary: any,
  proTeamId: number,
): { plays: ScoreAgainst[]; gNow: number } {
  const competition = summary?.header?.competitions?.[0];
  const competitors: any[] = competition?.competitors ?? [];
  const mine = competitors.find((c: any) => String(c?.team?.id) === String(proTeamId));
  const rival = competitors.find((c: any) => c !== mine && String(c?.team?.id) !== String(proTeamId));

  const status = competition?.status ?? {};
  const gNow = status?.type?.state === 'post'
    ? 1
    : Math.max(0.001, gameProgress(Number(status.period) || 1, String(status.displayClock ?? '15:00')));

  const plays: ScoreAgainst[] = [];
  if (!mine || !rival) return { plays, gNow };

  const rivalIsAway = rival.homeAway === 'away';
  let last = 0;
  for (const play of summary?.scoringPlays ?? []) {
    const score = Number((rivalIsAway ? play?.awayScore : play?.homeScore) ?? 0);
    if (score <= last) continue;
    last = score;
    plays.push({
      g: gameProgress(Number(play?.period?.number) || 1, String(play?.clock?.displayValue ?? '0:00')),
      pa: score,
    });
  }

  return { plays, gNow };
}
