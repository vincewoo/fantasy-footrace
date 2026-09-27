export const LEAGUE_ID = 918355353;
export const SEASON = 2026;

const LEAGUE_PATH = `/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${LEAGUE_ID}`;

export function espnBase(): string {
  const base = import.meta.env.VITE_ESPN_BASE;
  return base ? base : '/espn';
}

export function leagueUrl(
  views: string[],
  opts: { scoringPeriodId?: number; base?: string } = {},
): string {
  const params = new URLSearchParams();
  for (const view of views) params.append('view', view);
  if (opts.scoringPeriodId !== undefined) params.append('scoringPeriodId', String(opts.scoringPeriodId));

  return `${opts.base ?? espnBase()}${LEAGUE_PATH}?${params.toString()}`;
}

export class EspnError extends Error {
  status: number;
  kind: 'private' | 'http' | 'network' | 'key';

  constructor(message: string, status: number, kind: 'private' | 'http' | 'network' | 'key') {
    super(message);
    this.name = 'EspnError';
    this.status = status;
    this.kind = kind;
  }
}

export const KEY_STORAGE = 'ff_key';

export function savedKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE) || null;
  } catch {
    return null;
  }
}

export function saveKey(key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    // storage stays optional: private mode or a blocked origin both throw
  }
}

export async function fetchLeague(
  views: string[],
  opts: { scoringPeriodId?: number; filter?: unknown; fetchImpl?: typeof fetch } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {};
  const key = savedKey();
  if (key !== null) headers['X-Footrace-Key'] = key;
  if (opts.filter !== undefined) headers['X-Fantasy-Filter'] = JSON.stringify(opts.filter);

  const doFetch = opts.fetchImpl ?? fetch;
  const url = leagueUrl(views, { scoringPeriodId: opts.scoringPeriodId });

  let response: Response;
  try {
    response = await doFetch(url, { method: 'GET', headers, credentials: 'omit' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EspnError(`ESPN request to ${url} failed: ${detail}`, 0, 'network');
  }

  if (response.status === 401) {
    const body: unknown = await response.json().catch(() => null);
    const type = (body as { type?: unknown } | null)?.type;
    if (body === null || type === 'AUTH_LEAGUE_NOT_VISIBLE') {
      throw new EspnError('ESPN league is not visible without espn_s2/SWID', 401, 'private');
    }
  }

  if (response.status === 403) {
    const body: unknown = await response.json().catch(() => null);
    const type = (body as { type?: unknown } | null)?.type;
    if (type === 'FOOTRACE_KEY') {
      throw new EspnError('ESPN proxy rejected the league passphrase', 403, 'key');
    }
  }

  if (!response.ok) {
    throw new EspnError(`ESPN request to ${url} failed with HTTP ${response.status}`, response.status, 'http');
  }

  return response.json();
}

const SEASON_PATH = `/apis/v3/games/ffl/seasons/${SEASON}`;

export function seasonUrl(views: string[], opts: { base?: string } = {}): string {
  const params = new URLSearchParams();
  for (const view of views) params.append('view', view);

  return `${opts.base ?? espnBase()}${SEASON_PATH}?${params.toString()}`;
}

export async function fetchSeason(
  views: string[],
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {};
  const key = savedKey();
  if (key !== null) headers['X-Footrace-Key'] = key;

  const doFetch = opts.fetchImpl ?? fetch;
  const url = seasonUrl(views);

  let response: Response;
  try {
    response = await doFetch(url, { method: 'GET', headers, credentials: 'omit' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EspnError(`ESPN request to ${url} failed: ${detail}`, 0, 'network');
  }

  if (response.status === 401) {
    const body: unknown = await response.json().catch(() => null);
    const type = (body as { type?: unknown } | null)?.type;
    if (body === null || type === 'AUTH_LEAGUE_NOT_VISIBLE') {
      throw new EspnError('ESPN league is not visible without espn_s2/SWID', 401, 'private');
    }
  }

  if (response.status === 403) {
    const body: unknown = await response.json().catch(() => null);
    const type = (body as { type?: unknown } | null)?.type;
    if (type === 'FOOTRACE_KEY') {
      throw new EspnError('ESPN proxy rejected the league passphrase', 403, 'key');
    }
  }

  if (!response.ok) {
    throw new EspnError(`ESPN request to ${url} failed with HTTP ${response.status}`, response.status, 'http');
  }

  return response.json();
}
