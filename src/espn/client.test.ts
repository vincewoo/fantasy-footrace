import { afterEach, describe, expect, it, vi } from 'vitest';
import { EspnError, espnBase, fetchLeague, fetchSeason, KEY_STORAGE, leagueUrl, seasonUrl, LEAGUE_ID, SEASON } from './client';

const LEAGUE_PATH = `/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${LEAGUE_ID}`;

type Call = { url: string; init: RequestInit | undefined };

function fakeResponse(status: number, body: unknown, unparseable = false): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (unparseable) throw new SyntaxError('Unexpected token < in JSON');
      return body;
    },
  } as unknown as Response;
}

function fakeFetch(result: Response | Error): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (result instanceof Error) throw result;
    return result;
  };
  return { calls, fetchImpl };
}

function headersOf(call: Call): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

describe('espnBase', () => {
  it('falls back to the dev proxy path when VITE_ESPN_BASE is unset', () => {
    expect(espnBase()).toBe('/espn');
  });
});

describe('leagueUrl', () => {
  it('repeats view in order and appends the scoring period', () => {
    expect(leagueUrl(['mTeam', 'mSettings'], { scoringPeriodId: 3, base: '/espn' })).toBe(
      '/espn/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353?view=mTeam&view=mSettings&scoringPeriodId=3',
    );
  });

  it('uses the configured base by default', () => {
    expect(leagueUrl(['mTeam'])).toBe(`/espn${LEAGUE_PATH}?view=mTeam`);
  });
});

describe('fetchLeague', () => {
  it('returns the parsed body of a 200 and sends no credentials', async () => {
    const { calls, fetchImpl } = fakeFetch(fakeResponse(200, { id: LEAGUE_ID }));

    await expect(fetchLeague(['mTeam'], { fetchImpl })).resolves.toEqual({ id: LEAGUE_ID });

    expect(calls[0].url).toBe(`/espn${LEAGUE_PATH}?view=mTeam`);
    expect(calls[0].init?.credentials).toBe('omit');
    expect(headersOf(calls[0])['X-Fantasy-Filter']).toBeUndefined();
  });

  it('sends the X-Fantasy-Filter header when a filter is given', async () => {
    const filter = { schedule: { filterMatchupPeriodIds: { value: [3] } } };
    const { calls, fetchImpl } = fakeFetch(fakeResponse(200, {}));

    await fetchLeague(['mMatchupScore'], { scoringPeriodId: 3, filter, fetchImpl });

    expect(calls[0].url).toBe(`/espn${LEAGUE_PATH}?view=mMatchupScore&scoringPeriodId=3`);
    expect(headersOf(calls[0])['X-Fantasy-Filter']).toBe(JSON.stringify(filter));
  });

  it('reports a private league on a 401', async () => {
    const { fetchImpl } = fakeFetch(fakeResponse(401, { type: 'AUTH_LEAGUE_NOT_VISIBLE' }));

    const error = await fetchLeague(['mTeam'], { fetchImpl }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EspnError);
    expect(error).toMatchObject({ kind: 'private', status: 401 });
  });

  it('reports a private league on a 401 with an unparseable body', async () => {
    const { fetchImpl } = fakeFetch(fakeResponse(401, null, true));

    const error = await fetchLeague(['mTeam'], { fetchImpl }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind: 'private', status: 401 });
  });

  it('reports any other non-2xx as an http error', async () => {
    const { fetchImpl } = fakeFetch(fakeResponse(500, {}));

    const error = await fetchLeague(['mTeam'], { fetchImpl }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EspnError);
    expect(error).toMatchObject({ kind: 'http', status: 500 });
  });

  it('reports a rejected fetch as a network error', async () => {
    const { fetchImpl } = fakeFetch(new TypeError('Failed to fetch'));

    const error = await fetchLeague(['mTeam'], { fetchImpl }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EspnError);
    expect(error).toMatchObject({ kind: 'network' });
  });
});

describe('seasonUrl', () => {
  it('repeats the views on the season path', () => {
    expect(seasonUrl(['proTeamSchedules_wl'], { base: '/espn' })).toBe(
      '/espn/apis/v3/games/ffl/seasons/2026?view=proTeamSchedules_wl',
    );
  });

  it('uses the configured base by default', () => {
    expect(seasonUrl(['proTeamSchedules_wl'])).toBe(
      `/espn/apis/v3/games/ffl/seasons/${SEASON}?view=proTeamSchedules_wl`,
    );
  });
});

describe('fetchSeason', () => {
  it('returns the parsed body of a 200 and sends no credentials', async () => {
    const { calls, fetchImpl } = fakeFetch(fakeResponse(200, { proTeams: [] }));

    await expect(fetchSeason(['proTeamSchedules_wl'], { fetchImpl })).resolves.toEqual({ proTeams: [] });

    expect(calls[0].url).toBe(`/espn/apis/v3/games/ffl/seasons/${SEASON}?view=proTeamSchedules_wl`);
    expect(calls[0].init?.credentials).toBe('omit');
  });

  it('reports a private league on a 401', async () => {
    const { fetchImpl } = fakeFetch(fakeResponse(401, { type: 'AUTH_LEAGUE_NOT_VISIBLE' }));

    const error = await fetchSeason(['proTeamSchedules_wl'], { fetchImpl }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EspnError);
    expect(error).toMatchObject({ kind: 'private', status: 401 });
  });

  it('reports any other non-2xx as an http error', async () => {
    const { fetchImpl } = fakeFetch(fakeResponse(503, {}));

    const error = await fetchSeason(['proTeamSchedules_wl'], { fetchImpl }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EspnError);
    expect(error).toMatchObject({ kind: 'http', status: 503 });
  });

  it('reports a rejected fetch as a network error', async () => {
    const { fetchImpl } = fakeFetch(new TypeError('Failed to fetch'));

    const error = await fetchSeason(['proTeamSchedules_wl'], { fetchImpl }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EspnError);
    expect(error).toMatchObject({ kind: 'network' });
  });
});

function stubKey(stored: string | null): void {
  const store = new Map<string, string>();
  if (stored !== null) store.set(KEY_STORAGE, stored);
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => store.get(name) ?? null,
    setItem: (name: string, value: string) => void store.set(name, value),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('passphrase', () => {
  it('reports a FOOTRACE_KEY 403 as a key error', async () => {
    const { fetchImpl } = fakeFetch(fakeResponse(403, { type: 'FOOTRACE_KEY' }));

    const error = await fetchLeague(['mTeam'], { fetchImpl }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EspnError);
    expect(error).toMatchObject({ kind: 'key', status: 403 });
  });

  it('sends the saved key as X-Footrace-Key', async () => {
    stubKey('k1');
    const { calls, fetchImpl } = fakeFetch(fakeResponse(200, {}));

    await fetchLeague(['mTeam'], { fetchImpl });

    expect(headersOf(calls[0])['X-Footrace-Key']).toBe('k1');
  });

  it('sends no key header when none is saved', async () => {
    stubKey(null);
    const { calls, fetchImpl } = fakeFetch(fakeResponse(200, {}));

    await fetchLeague(['mTeam'], { fetchImpl });

    expect(headersOf(calls[0])['X-Footrace-Key']).toBeUndefined();
  });
});
