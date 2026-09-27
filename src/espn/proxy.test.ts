import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProxyOptions } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { cookieHeader, ESPN_HOST, espnProxy, isAllowedPath, PROXY_PREFIX } from './proxy';

const LEAGUE_ID = 918355353;
const ENV = { ESPN_S2: 'abc', SWID: '{G-1}' };
const LEAGUE_PATH = `/apis/v3/games/ffl/seasons/2026/segments/0/leagues/${LEAGUE_ID}`;

type ProxyReq = {
  setHeader: (name: string, value: string) => void;
  removeHeader: (name: string) => void;
};

function bypass(options: ProxyOptions, method: string, url: string) {
  return options.bypass!(
    { method, url } as unknown as IncomingMessage,
    {} as unknown as ServerResponse,
    options,
  );
}

function proxyReqHandler(options: ProxyOptions): (proxyReq: ProxyReq) => void {
  const handlers: Record<string, (proxyReq: ProxyReq) => void> = {};
  const fakeProxy = {
    on: (event: string, handler: (proxyReq: ProxyReq) => void) => {
      handlers[event] = handler;
    },
  };

  options.configure!(
    fakeProxy as unknown as Parameters<NonNullable<ProxyOptions['configure']>>[0],
    options,
  );

  return handlers.proxyReq;
}

describe('cookieHeader', () => {
  it('builds the espn_s2/SWID cookie pair, braces included', () => {
    expect(cookieHeader({ ESPN_S2: 'abc', SWID: '{G-1}' })).toBe('espn_s2=abc; SWID={G-1}');
  });

  it('is null when a value is blank or missing', () => {
    expect(cookieHeader({ ESPN_S2: ' ', SWID: '{G}' })).toBeNull();
    expect(cookieHeader({})).toBeNull();
  });
});

describe('isAllowedPath', () => {
  it('allows the league path and the season path, query and all', () => {
    expect(
      isAllowedPath('/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353?view=mTeam&view=mSettings', LEAGUE_ID),
    ).toBe(true);
    expect(isAllowedPath('/apis/v3/games/ffl/seasons/2026?view=proTeamSchedules_wl', LEAGUE_ID)).toBe(true);
  });

  it('refuses another league, deeper paths, traversal, encoded slashes and other sports', () => {
    expect(isAllowedPath('/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1?view=mTeam', LEAGUE_ID)).toBe(false);
    expect(
      isAllowedPath('/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353/transactions', LEAGUE_ID),
    ).toBe(false);
    expect(
      isAllowedPath('/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353/../1', LEAGUE_ID),
    ).toBe(false);
    expect(isAllowedPath('/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353%2F..', LEAGUE_ID)).toBe(false);
    expect(isAllowedPath('/apis/v3/games/fba/seasons/2026/segments/0/leagues/918355353', LEAGUE_ID)).toBe(false);
  });
});

describe('espnProxy', () => {
  it('targets the read host, changes the origin and strips the prefix', () => {
    const options = espnProxy(ENV, LEAGUE_ID);
    expect(options.target).toBe(ESPN_HOST);
    expect(options.changeOrigin).toBe(true);
    expect(options.rewrite!('/espn/apis/v3/games/ffl/seasons/2026')).toBe('/apis/v3/games/ffl/seasons/2026');
  });

  it('answers 404 for non-GET requests and for paths outside the league', () => {
    const options = espnProxy(ENV, LEAGUE_ID);
    expect(bypass(options, 'POST', `${PROXY_PREFIX}${LEAGUE_PATH}`)).toBe(false);
    expect(bypass(options, 'GET', `${PROXY_PREFIX}/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1`)).toBe(false);
  });

  it('lets an allowed GET through to the proxy', () => {
    const options = espnProxy(ENV, LEAGUE_ID);
    expect(bypass(options, 'GET', `${PROXY_PREFIX}${LEAGUE_PATH}`)).toBeUndefined();
  });

  it('sets the env cookie and strips browser credentials on proxyReq', () => {
    const options = espnProxy(ENV, LEAGUE_ID);
    const setHeader = vi.fn<(name: string, value: string) => void>();
    const removeHeader = vi.fn<(name: string) => void>();

    proxyReqHandler(options)({ setHeader, removeHeader });

    expect(setHeader).toHaveBeenCalledWith('cookie', 'espn_s2=abc; SWID={G-1}');
    expect(setHeader).toHaveBeenCalledWith('origin', 'https://fantasy.espn.com');
    expect(removeHeader).toHaveBeenCalledWith('cookie');
    expect(removeHeader).toHaveBeenCalledWith('referer');
  });

  it('sends no cookie at all when the env has none', () => {
    const options = espnProxy({}, LEAGUE_ID);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setHeader = vi.fn<(name: string, value: string) => void>();
    const removeHeader = vi.fn<(name: string) => void>();

    proxyReqHandler(options)({ setHeader, removeHeader });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe(
      '[espn proxy] ESPN_S2/SWID missing in .env.local - private league requests will 401',
    );
    expect(setHeader).not.toHaveBeenCalledWith('cookie', expect.anything());
    expect(removeHeader).toHaveBeenCalledWith('cookie');

    warn.mockRestore();
  });
});
