import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Player } from '../model/types';
import { buildSlate } from './slate';
import {
  fetchScoreboard,
  gameLabel,
  scoreboardUrl,
  statusesByTeam,
  withGameStatus,
  type GameStatus,
} from './scoreboard';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

const scoreboard = fixture('scoreboard-week3-sun-am.json');
const league = fixture('week3-pregame.json');
const season = fixture('season-2026-proteams.json');
const slate = buildSlate(league, season, 1, { timeZone: 'America/New_York' });

type Call = { url: string; init: RequestInit | undefined };

function fakeResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
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

const bufStatus = (edit: Partial<GameStatus>): GameStatus => ({
  state: 'in',
  name: 'STATUS_IN_PROGRESS',
  period: 1,
  displayClock: '0:00',
  shortDetail: '',
  completed: false,
  ...edit,
});

describe('scoreboardUrl', () => {
  it('asks the public site API for the regular-season week', () => {
    expect(scoreboardUrl(2026, 3)).toBe(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=3&dates=2026',
    );
  });
});

describe('fetchScoreboard', () => {
  it('GETs the week without credentials and returns the parsed body', async () => {
    const { calls, fetchImpl } = fakeFetch(fakeResponse(200, scoreboard));

    await expect(fetchScoreboard(2026, 3, { fetchImpl })).resolves.toEqual(scoreboard);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(scoreboardUrl(2026, 3));
    expect(calls[0].init?.method).toBe('GET');
    expect(calls[0].init?.credentials).toBe('omit');
    expect(calls[0].init?.headers).toBeUndefined();
  });

  it('rejects with the status on a non-2xx', async () => {
    const { fetchImpl } = fakeFetch(fakeResponse(500, {}));

    await expect(fetchScoreboard(2026, 3, { fetchImpl })).rejects.toThrow('500');
  });

  it('rejects with the cause of a thrown fetch', async () => {
    const { fetchImpl } = fakeFetch(new TypeError('Failed to fetch'));

    await expect(fetchScoreboard(2026, 3, { fetchImpl })).rejects.toThrow('Failed to fetch');
  });
});

describe('the recorded Sunday morning scoreboard', () => {
  it('has 16 events, 15 not started and 1 final', () => {
    const states: Record<string, number> = {};
    for (const event of scoreboard.events) {
      const state = event.competitions[0].status.type.state;
      states[state] = (states[state] ?? 0) + 1;
    }

    expect(scoreboard.events).toHaveLength(16);
    expect(states).toEqual({ pre: 15, post: 1 });
  });
});

describe('statusesByTeam', () => {
  const statuses = statusesByTeam(scoreboard);

  it('keys every one of the 32 teams by its own abbrev', () => {
    expect(Object.keys(statuses)).toHaveLength(32);
    expect(Object.keys(statuses).sort()).toEqual(
      ['ATL','BUF','CHI','CIN','CLE','DAL','DEN','DET','GB','TEN','IND','KC','LV','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','ARI','PIT','LAC','SF','SEA','TB','WSH','CAR','JAX','BAL','HOU'].sort(),
    );
  });

  it('maps ESPN id 28 to the abbrev proTeams.ts holds for it', () => {
    expect(statuses.WSH).toBeDefined();
    expect(statuses.WSH.state).toBe('pre');
  });

  it('gives both competitors of the finished game the final status', () => {
    expect(statuses.GB).toMatchObject({ state: 'post', completed: true, shortDetail: 'Final', period: 4 });
    expect(statuses.ATL).toEqual(statuses.GB);
  });

  it('gives both competitors of a scheduled game the same pre status', () => {
    expect(statuses.BUF).toMatchObject({ state: 'pre', shortDetail: '9/27 - 1:00 PM EDT', period: 0 });
    expect(statuses.LAC).toEqual(statuses.BUF);
  });

  it('skips an event with an unknown team id instead of throwing', () => {
    const one = {
      events: [
        {
          competitions: [
            {
              status: { clock: 0, displayClock: '0:00', period: 0, type: scoreboard.events[0].competitions[0].status.type },
              competitors: [{ team: { id: '9' } }, { team: { id: '31' } }, { team: { id: 'x' } }, {}],
            },
          ],
        },
      ],
    };

    expect(statusesByTeam(one)).toEqual({ GB: statuses.BUF });
  });

  it('returns nothing for a body without events', () => {
    expect(statusesByTeam({})).toEqual({});
    expect(statusesByTeam(null)).toEqual({});
  });
});

describe('gameLabel', () => {
  const statuses = statusesByTeam(scoreboard);

  it('reads the final and the not started games', () => {
    expect(gameLabel(statuses.GB)).toBe('FINAL');
    expect(gameLabel(statuses.BUF)).toBeNull();
  });

  it('reads the clock of a game in progress', () => {
    expect(gameLabel(bufStatus({ period: 2, displayClock: '4:31' }))).toBe('Q2 4:31');
    expect(gameLabel(bufStatus({ period: 5, displayClock: '2:10' }))).toBe('OT 2:10');
  });

  it('reads halftime and the end of a period', () => {
    expect(gameLabel(bufStatus({ name: 'STATUS_HALFTIME', period: 2 }))).toBe('HALF');
    expect(gameLabel(bufStatus({ name: 'STATUS_END_PERIOD', period: 3 }))).toBe('END Q3');
    expect(gameLabel(bufStatus({ name: 'STATUS_END_PERIOD', period: 5 }))).toBe('END OT');
  });

  it('uppercases the detail of a game that ended without being completed', () => {
    expect(gameLabel(bufStatus({ state: 'post', completed: false, shortDetail: 'Postponed' }))).toBe('POSTPONED');
  });
});

describe('withGameStatus', () => {
  const statuses: Record<string, GameStatus> = {
    ...statusesByTeam(scoreboard),
    DET: bufStatus({ period: 2, displayClock: '4:31' }),
  };
  const withStatus = withGameStatus(slate, statuses, 0.5);

  it('replaces the timeline label with the game clock at the live moment', () => {
    const goff = slate.lanes[0].me;
    expect(goff.team).toBe('DET');
    expect(withStatus.statusLabel(goff, 0.5)).toBe('Q2 4:31');
  });

  it('keeps the timeline label while replaying', () => {
    const goff = slate.lanes[0].me;
    expect(slate.statusLabel(goff, 0.3)).toBe('LIVE');
    expect(withStatus.statusLabel(goff, 0.3)).toBe('LIVE');
  });

  it('keeps the timeline label for a game that has not started', () => {
    const buf = { ...slate.lanes[0].me, team: 'BUF' };
    expect(withStatus.statusLabel(buf, 0.5)).toBe(slate.statusLabel(buf, 0.5));
  });

  it('keeps the timeline label for a team the scoreboard does not list', () => {
    const bears = { ...slate.lanes[0].me, team: 'CHI' };
    const without = withGameStatus(slate, { DET: statuses.DET }, 0.5);
    expect(without.statusLabel(bears, 0.5)).toBe(slate.statusLabel(bears, 0.5));
  });

  it('returns an otherwise identical slate with the same events', () => {
    expect(withStatus.events).toBe(slate.events);
    expect(withStatus.lanes).toBe(slate.lanes);
    expect(withStatus.me).toBe(slate.me);
    expect(withStatus.opp).toBe(slate.opp);
    expect(withStatus.teamColors).toBe(slate.teamColors);
    expect(withStatus.clockLabel).toBe(slate.clockLabel);
    expect(withStatus.axis).toBe(slate.axis);
    expect(withStatus).not.toBe(slate);
  });

  it('leaves the slate it was given alone', () => {
    const player: Player = slate.lanes[0].me;
    expect(slate.statusLabel(player, 0.3)).toBe('LIVE');
    expect(slate.statusLabel(player, 0.45)).toBe('FINAL');
  });
});
