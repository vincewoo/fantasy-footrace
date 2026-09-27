import type { ProxyOptions } from 'vite';

export const ESPN_HOST = 'https://lm-api-reads.fantasy.espn.com';
export const PROXY_PREFIX = '/espn';

const ESPN_ORIGIN = 'https://fantasy.espn.com';

const LEAGUE_PATH = /^\/apis\/v3\/games\/ffl\/seasons\/\d{4}\/segments\/0\/leagues\/(\d+)$/;
const SEASON_PATH = /^\/apis\/v3\/games\/ffl\/seasons\/\d{4}$/;

export function cookieHeader(env: Record<string, string | undefined>): string | null {
  const s2 = env.ESPN_S2?.trim();
  const swid = env.SWID?.trim();
  if (!s2 || !swid) return null;
  return `espn_s2=${s2}; SWID=${swid}`;
}

export function isAllowedPath(path: string, leagueId: number): boolean {
  const pathname = path.split('?')[0];
  if (pathname.includes('..') || /%2f/i.test(pathname)) return false;

  const league = LEAGUE_PATH.exec(pathname);
  if (league) return league[1] === String(leagueId);
  return SEASON_PATH.test(pathname);
}

export function espnProxy(env: Record<string, string | undefined>, leagueId: number): ProxyOptions {
  const cookie = cookieHeader(env);

  return {
    target: ESPN_HOST,
    changeOrigin: true,
    rewrite: (path) => path.replace(PROXY_PREFIX, ''),
    bypass(req) {
      if (req.method !== 'GET') return false;
      const url = req.url ?? '';
      const path = url.startsWith(PROXY_PREFIX) ? url.slice(PROXY_PREFIX.length) : url;
      return isAllowedPath(path, leagueId) ? undefined : false;
    },
    configure(proxy) {
      if (cookie === null) {
        console.warn(
          '[espn proxy] ESPN_S2/SWID missing in .env.local - private league requests will 401',
        );
      }

      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.removeHeader('cookie');
        if (cookie !== null) proxyReq.setHeader('cookie', cookie);
        proxyReq.setHeader('origin', ESPN_ORIGIN);
        proxyReq.removeHeader('referer');
      });
    },
  };
}
