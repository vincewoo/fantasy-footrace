import { cookieHeader, ESPN_HOST, isAllowedPath } from '../espn/proxy';
import { keyFromProtocols, parseTalkPath } from './talk';

export { TalkRoom } from './talk';

export interface WorkerEnv {
  ESPN_S2?: string;
  SWID?: string;
  ALLOWED_ORIGIN?: string;
  PASSPHRASE?: string;
  LEAGUE_ID?: string;
  TALK?: { idFromName(name: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } };
}

function json(type: string, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ type }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function corsHeaders(sameOrigin: boolean, allowed: string | undefined): Record<string, string> {
  if (!sameOrigin) return {};
  return {
    'access-control-allow-origin': String(allowed),
    vary: 'Origin',
    'access-control-allow-headers': 'X-Fantasy-Filter, X-Footrace-Key',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-max-age': '600',
  };
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

async function keyMatches(given: string | null, passphrase: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given ?? ''), digest(passphrase)]);
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function talkRoute(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return json('FOOTRACE_ORIGIN', 403, {});

  const upgrade = request.headers.get('Upgrade');
  if (upgrade === null || upgrade.toLowerCase() !== 'websocket') return json('FOOTRACE_UPGRADE', 426, {});

  const passphrase = env.PASSPHRASE;
  if (!passphrase) return json('FOOTRACE_CONFIG', 500, {});

  const key = keyFromProtocols(request.headers.get('Sec-WebSocket-Protocol'));
  if (!(await keyMatches(key, passphrase))) return json('FOOTRACE_KEY', 403, {});

  const path = parseTalkPath(url);
  if (path === null) return json('FOOTRACE_PATH', 404, {});

  const talk = env.TALK;
  if (!talk) return json('FOOTRACE_CONFIG', 500, {});

  const league = env.LEAGUE_ID ?? '918355353';
  return talk.get(talk.idFromName(`${league}:${path.season}:${path.week}:${path.matchupId}`)).fetch(request);
}

export async function handle(
  request: Request,
  env: WorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGIN;
  const sameOrigin = origin !== null && origin === allowed;
  const cors = corsHeaders(sameOrigin, allowed);

  if (origin !== null && !sameOrigin) return json('FOOTRACE_ORIGIN', 403, {});

  const url = new URL(request.url);
  if (url.pathname.startsWith('/talk/')) return talkRoute(request, env, url);

  if (request.method === 'OPTIONS' && sameOrigin) return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json('FOOTRACE_METHOD', 405, cors);

  const cookie = cookieHeader(env as Record<string, string | undefined>);
  const passphrase = env.PASSPHRASE;
  if (cookie === null || !passphrase) return json('FOOTRACE_CONFIG', 500, cors);

  if (!(await keyMatches(request.headers.get('X-Footrace-Key'), passphrase))) {
    return json('FOOTRACE_KEY', 403, cors);
  }

  const path = url.pathname + url.search;
  const league = Number(env.LEAGUE_ID ?? '918355353');
  if (!isAllowedPath(path, league)) return json('FOOTRACE_PATH', 404, cors);

  const headers: Record<string, string> = { cookie, accept: 'application/json' };
  const filter = request.headers.get('x-fantasy-filter');
  if (filter !== null) headers['x-fantasy-filter'] = filter;

  let upstream: Response;
  try {
    upstream = await fetchImpl(ESPN_HOST + path, { method: 'GET', headers });
  } catch {
    return json('FOOTRACE_UPSTREAM', 502, cors);
  }

  const out = new Headers(cors);
  const contentType = upstream.headers.get('content-type');
  if (contentType !== null) out.set('content-type', contentType);
  out.set('cache-control', 'no-store');

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export default { fetch: (request: Request, env: WorkerEnv): Promise<Response> => handle(request, env) };
