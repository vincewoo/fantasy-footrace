import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fetchSummary, gameProgress, scoresAgainst, summaryUrl, yardsAgainst } from './summary';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));

const summary = fixture('summary-401872950-live.json');

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(body: unknown, status = 200): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  };
  return { calls, fetchImpl };
}

describe('summaryUrl', () => {
  it('points at the public CORS-open game summary', () => {
    expect(summaryUrl('401872950')).toBe(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401872950',
    );
  });
});

describe('fetchSummary', () => {
  it('GETs the summary for the event without credentials', async () => {
    const { calls, fetchImpl } = fakeFetch(summary);

    const body = await fetchSummary('401872950', { fetchImpl });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(summaryUrl('401872950'));
    expect(calls[0].init).toMatchObject({ method: 'GET', credentials: 'omit' });
    expect(body).toBe(summary);
  });

  it('rejects a non-2xx response', async () => {
    const { fetchImpl } = fakeFetch({ message: 'nope' }, 404);

    await expect(fetchSummary('401872950', { fetchImpl })).rejects.toThrow('HTTP 404');
  });

  it('rejects a fetch that throws', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('offline');
    };

    await expect(fetchSummary('401872950', { fetchImpl })).rejects.toThrow('offline');
  });
});

describe('gameProgress', () => {
  it('measures the part of the game played as the clock counts down', () => {
    expect(Number(gameProgress(1, '15:00').toFixed(6))).toBe(0);
    expect(Number(gameProgress(1, '13:10').toFixed(6))).toBe(0.030556);
    expect(Number(gameProgress(1, '0:52').toFixed(6))).toBe(0.235556);
    expect(Number(gameProgress(1, '0:00').toFixed(6))).toBe(0.25);
    expect(Number(gameProgress(2, '12:13').toFixed(6))).toBe(0.296389);
    expect(Number(gameProgress(4, '0:00').toFixed(6))).toBe(1);
    expect(gameProgress(4, '10:00')).toBeLessThan(1);
  });
});

describe('scoresAgainst', () => {
  it('lists every score the away defense gave up with its game progress', () => {
    const { plays, gNow } = scoresAgainst(summary, 4);

    expect(plays).toHaveLength(2);
    expect(Number(plays[0].g.toFixed(6))).toBe(0.030556);
    expect(plays[0].pa).toBe(7);
    expect(Number(plays[1].g.toFixed(6))).toBe(0.235556);
    expect(plays[1].pa).toBe(14);
    expect(Number(gNow.toFixed(6))).toBe(0.296389);
  });

  it('only counts the plays the home defense gave up', () => {
    const { plays, gNow } = scoresAgainst(summary, 23);

    expect(plays).toHaveLength(1);
    expect(plays[0]).toEqual({ g: 550 / 3600, pa: 7 });
    expect(Number(plays[0].g.toFixed(6))).toBe(0.152778);
    expect(Number(gNow.toFixed(6))).toBe(0.296389);
  });

  it('is finished at 1 once the game is over', () => {
    const final = JSON.parse(JSON.stringify(summary));
    final.header.competitions[0].status.type.state = 'post';

    expect(scoresAgainst(final, 4).gNow).toBe(1);
  });

  it('keeps every scoring play the opponent put up in order', () => {
    const late = JSON.parse(JSON.stringify(summary));
    late.scoringPlays.push({
      period: { number: 2 },
      clock: { displayValue: '9:00' },
      team: { id: '23' },
      awayScore: 14,
      homeScore: 21,
    });

    const { plays } = scoresAgainst(late, 4);

    expect(plays.map(p => p.pa)).toEqual([7, 14, 21]);
    expect(Number(plays[2].g.toFixed(6))).toBe(0.35);
  });

  it('skips a play that did not move the opponent’s score', () => {
    const tied = JSON.parse(JSON.stringify(summary));
    tied.scoringPlays = [
      { period: { number: 1 }, clock: { displayValue: '13:10' }, team: { id: '4' }, awayScore: 7, homeScore: 0 },
      { period: { number: 1 }, clock: { displayValue: '5:50' }, team: { id: '4' }, awayScore: 7, homeScore: 7 },
    ];

    expect(scoresAgainst(tied, 23).plays).toEqual([{ g: 110 / 3600, pa: 7 }]);
  });

  it('floors the progress of a not-yet-started game', () => {
    const pre = JSON.parse(JSON.stringify(summary));
    pre.header.competitions[0].status = {
      type: { state: 'pre' },
      period: 1,
      displayClock: '15:00',
    };

    expect(scoresAgainst(pre, 4).gNow).toBe(0.001);
  });

  it('has no plays for a team that is not in the game', () => {
    const { plays, gNow } = scoresAgainst(summary, 99);

    expect(plays).toEqual([]);
    expect(Number(gNow.toFixed(6))).toBe(0.296389);
  });
});

describe('yardsAgainst', () => {
  it('totals the yards the away defense gave up drive by drive', () => {
    const drives = yardsAgainst(summary, 4);

    expect(drives).toHaveLength(2);
    expect(Number(drives[0].g!.toFixed(6))).toBe(0.030556);
    expect(drives[0].ya).toBe(73);
    expect(Number(drives[1].g!.toFixed(6))).toBe(0.235556);
    expect(drives[1].ya).toBe(159);
  });

  it('counts the in-progress drive once with no progress', () => {
    const drives = yardsAgainst(summary, 23);

    expect(drives).toHaveLength(2);
    expect(Number(drives[0].g!.toFixed(6))).toBe(0.152778);
    expect(drives[0].ya).toBe(73);
    expect(drives[1].g).toBeNull();
    expect(drives[1].ya).toBe(105);
  });

  it('keeps the in-progress drive in its own slot when it also sits in previous', () => {
    const live = JSON.parse(JSON.stringify(summary));
    live.drives.previous[3].yards = 10;
    live.drives.current.yards = 42;
    live.drives.current.end = { period: { number: 2 }, clock: { displayValue: '10:00' } };

    const drives = yardsAgainst(live, 23);

    expect(drives.map(d => d.ya)).toEqual([73, 115]);
    expect(Number(drives[1].g!.toFixed(6))).toBe(0.333333);
  });

  it('treats a drive with no yards as zero', () => {
    const bare = JSON.parse(JSON.stringify(summary));
    delete bare.drives.previous[1].yards;

    expect(yardsAgainst(bare, 23)[0].ya).toBe(0);
  });

  it('has no drives for a summary without them', () => {
    expect(yardsAgainst({}, 4)).toEqual([]);
    expect(yardsAgainst({ drives: { current: { id: 1, team: { id: 4 }, yards: 30 } } }, 4)).toEqual([]);
  });
});
