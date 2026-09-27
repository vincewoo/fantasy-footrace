import { describe, expect, it } from 'vitest';
import worker, { handle, type WorkerEnv } from './index';

const ESPN = 'https://lm-api-reads.fantasy.espn.com';
const L = 'https://w.example/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353?view=mTeam';
const SEASON_L = 'https://w.example/apis/v3/games/ffl/seasons/2026?view=proTeamSchedules_wl';

const env: WorkerEnv = {
  ESPN_S2: 's2',
  SWID: '{G}',
  ALLOWED_ORIGIN: 'https://ff.example',
  PASSPHRASE: 'hunter2',
};

type Call = { url: string; init: RequestInit | undefined };

function ok(): Response {
  return new Response('{"ok":1}', {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': 'x=1' },
  });
}

function spyFetch(result: Response | Error = ok()): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (result instanceof Error) throw result;
    return result;
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function request(url: string, headers: Record<string, string> = {}, method = 'GET'): Request {
  return new Request(url, { method, headers });
}

function allowed(key: string | null, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (key !== null) headers['X-Footrace-Key'] = key;
  return headers;
}

function sent(call: Call): Headers {
  return new Headers(call.init?.headers);
}

describe('worker', () => {
  it('exports a fetch handler', () => {
    expect(typeof worker.fetch).toBe('function');
  });

  it('forwards an allowed GET and keeps the cookies and CORS off the response', async () => {
    const { calls, fetchImpl } = spyFetch();
    const response = await handle(request(L, allowed('hunter2', { Origin: 'https://ff.example' })), env, fetchImpl);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('{"ok":1}');
    expect(response.headers.get('access-control-allow-origin')).toBe('https://ff.example');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `${ESPN}/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353?view=mTeam`,
    );
    expect(sent(calls[0]).get('cookie')).toBe('espn_s2=s2; SWID={G}');
    expect(sent(calls[0]).get('accept')).toBe('application/json');
    expect(sent(calls[0]).get('origin')).toBeNull();
  });

  it('copies only the fantasy filter from the request headers', async () => {
    const { calls, fetchImpl } = spyFetch();
    await handle(
      request(L, allowed('hunter2', { Origin: 'https://ff.example', 'X-Fantasy-Filter': '{"a":1}' })),
      env,
      fetchImpl,
    );

    expect(sent(calls[0]).get('x-fantasy-filter')).toBe('{"a":1}');
    expect(sent(calls[0]).get('x-footrace-key')).toBeNull();
  });

  it('rejects a wrong key without calling upstream', async () => {
    const { calls, fetchImpl } = spyFetch();
    const response = await handle(request(L, allowed('nope', { Origin: 'https://ff.example' })), env, fetchImpl);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ type: 'FOOTRACE_KEY' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a missing key', async () => {
    const { calls, fetchImpl } = spyFetch();
    const response = await handle(request(L, allowed(null, { Origin: 'https://ff.example' })), env, fetchImpl);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ type: 'FOOTRACE_KEY' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a foreign origin with no CORS headers', async () => {
    const { calls, fetchImpl } = spyFetch();
    const response = await handle(request(L, allowed('hunter2', { Origin: 'https://evil.example' })), env, fetchImpl);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ type: 'FOOTRACE_ORIGIN' });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('answers the preflight from the allowed origin', async () => {
    const { calls, fetchImpl } = spyFetch();
    const response = await handle(
      request(L, { Origin: 'https://ff.example', 'Access-Control-Request-Headers': 'X-Footrace-Key' }, 'OPTIONS'),
      env,
      fetchImpl,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toContain('X-Footrace-Key');
    expect(calls).toHaveLength(0);
  });

  it('refuses methods other than GET', async () => {
    const { calls, fetchImpl } = spyFetch();
    const response = await handle(
      request(L, allowed('hunter2', { Origin: 'https://ff.example' }), 'POST'),
      env,
      fetchImpl,
    );

    expect(response.status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it('refuses another league and a path that is not on the allowlist', async () => {
    const { calls, fetchImpl } = spyFetch();
    const headers = allowed('hunter2', { Origin: 'https://ff.example' });

    const other = await handle(
      request('https://w.example/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1?view=mTeam', headers),
      env,
      fetchImpl,
    );
    const transactions = await handle(
      request('https://w.example/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353/transactions', headers),
      env,
      fetchImpl,
    );

    expect(other.status).toBe(404);
    expect(transactions.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('forwards the season path', async () => {
    const { calls, fetchImpl } = spyFetch();
    const response = await handle(request(SEASON_L, allowed('hunter2', { Origin: 'https://ff.example' })), env, fetchImpl);

    expect(response.status).toBe(200);
    expect(calls[0].url).toBe(`${ESPN}/apis/v3/games/ffl/seasons/2026?view=proTeamSchedules_wl`);
  });

  it('reports a missing configuration without naming the variable', async () => {
    const { calls, fetchImpl } = spyFetch();
    const broken: WorkerEnv = {
      ESPN_S2: 's2',
      ALLOWED_ORIGIN: 'https://ff.example',
      PASSPHRASE: 'hunter2',
    };
    const response = await handle(request(L, allowed('hunter2', { Origin: 'https://ff.example' })), broken, fetchImpl);

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ type: 'FOOTRACE_CONFIG' });
    expect(body).not.toContain('SWID');
    expect(body).not.toContain('ESPN_S2');
    expect(calls).toHaveLength(0);
  });

  it('reports a failed upstream', async () => {
    const { fetchImpl } = spyFetch(new TypeError('Failed to fetch'));
    const response = await handle(request(L, allowed('hunter2', { Origin: 'https://ff.example' })), env, fetchImpl);

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ type: 'FOOTRACE_UPSTREAM' });
  });

  it('serves a request with no origin header without CORS headers', async () => {
    const { fetchImpl } = spyFetch();
    const response = await handle(request(L, allowed('hunter2')), env, fetchImpl);

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
