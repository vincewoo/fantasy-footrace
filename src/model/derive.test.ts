import { expect, it } from 'vitest';
import { mockSlate } from '../sim/mock';
import { erf, fmt, sgn, snapshotAt } from './derive';

const HALF = mockSlate('Half PPR');

it('formats and shapes numbers like the design', () => {
  expect(sgn(3.14)).toBe('+3.1');
  expect(sgn(-2)).toBe('\u22122.0');
  expect(sgn(0.01)).toBe('0.0');
  expect(erf(0.5).toFixed(3)).toBe('0.521');
  expect(erf(-1).toFixed(3)).toBe('-0.843');
});

it('matches the design\u2019s snapshot at every pinned slate time', () => {
  const pinned: [number, [string, string, string, string, number]][] = [
    [0, ['0.0', '0.0', '138.5', '136.1', 54]],
    [0.06, ['15.1', '9.1', '137.7', '132.9', 59]],
    [0.3, ['82.1', '57.3', '138.0', '129.4', 71]],
    [0.5, ['102.4', '83.8', '133.7', '120.1', 88]],
    [1, ['172.0', '132.4', '172.0', '132.4', 100]],
  ];

  for (const [t, row] of pinned) {
    const s = snapshotAt(HALF, t);
    expect([fmt(s.totals.me), fmt(s.totals.opp), fmt(s.projected.me), fmt(s.projected.opp), s.winPct]).toEqual(row);
  }
});

it('tracks lane totals, outs and the events so far', () => {
  const s = snapshotAt(HALF, 0.5);

  expect(s.laneTotals).toHaveLength(9);
  expect(s.laneTotals.reduce((a, l) => a + l.me, 0)).toBeCloseTo(s.totals.me, 10);
  expect(s.laneTotals.reduce((a, l) => a + l.opp, 0)).toBeCloseTo(s.totals.opp, 10);
  expect(s.past).toEqual(HALF.events.filter(e => e.t <= 0.5));

  expect(snapshotAt(HALF, 0.06).out.size).toBe(0);
  expect([...snapshotAt(HALF, 0.3).out]).toEqual(['opp2']);
});

it('takes ESPN’s latest win probability at or before t, and the model before the first reading', () => {
  const slate = { ...HALF, odds: [{ t: 0.3, me: 0.42 }, { t: 0.5, me: 0.6 }] };

  expect(snapshotAt(slate, 0.06).winPct).toBe(59);
  expect(snapshotAt(slate, 0.3).winPct).toBe(42);
  expect(snapshotAt(slate, 0.45).winPct).toBe(42);
  expect(snapshotAt(slate, 0.7).winPct).toBe(60);
  expect(snapshotAt(slate, 1).winPct).toBe(100);
});
