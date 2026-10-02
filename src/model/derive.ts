import type { PlayEvent, Side, Slate } from './types';

const SIDES: Side[] = ['me', 'opp'];

export function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

export function sgn(n: number): string {
  return n > 0.049 ? `+${fmt(n)}` : n < -0.049 ? `\u2212${fmt(-n)}` : '0.0';
}

export function erf(x: number): number {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

export interface SideTotals {
  me: number;
  opp: number;
}

export interface Snapshot {
  totals: SideTotals;
  projected: SideTotals;
  winPct: number;
  laneTotals: { me: number; opp: number }[];
  out: Set<string>;
  past: PlayEvent[];
}

export function snapshotAt(slate: Slate, t: number): Snapshot {
  const totals: SideTotals = { me: 0, opp: 0 };
  const laneTotals = slate.lanes.map(() => ({ me: 0, opp: 0 }));
  const out = new Set<string>();
  const past: PlayEvent[] = [];

  for (const e of slate.events) {
    if (e.t > t) break;
    laneTotals[e.lane][e.side] += e.pts;
    totals[e.side] += e.pts;
    if (e.kind === 'injury') out.add(`${e.side}${e.lane}`);
    past.push(e);
  }

  const rem: SideTotals = { me: 0, opp: 0 };
  let v = 0;
  for (const side of SIDES) {
    slate.lanes.forEach((lane, i) => {
      const p = lane[side];
      const [a, b] = p.window;
      const f = Math.max(0, Math.min(1, (t - a) / (b - a)));
      const r = out.has(`${side}${i}`) ? 0 : p.proj * (1 - f);
      rem[side] += r;
      v += r * 1.8;
    });
  }

  const mu = totals.me + rem.me - (totals.opp + rem.opp);
  const sd = Math.sqrt(v) + 0.4;
  let pw = 0.5 * (1 + erf(mu / sd / Math.SQRT2));
  pw = t >= 1
    ? (totals.me > totals.opp ? 1 : totals.me < totals.opp ? 0 : 0.5)
    : Math.min(0.99, Math.max(0.01, pw));

  // ESPN's number wins wherever we have one; the model only fills replay from before the first poll.
  const espn = t < 1 ? slate.odds?.filter(o => o.t <= t).pop() : undefined;
  if (espn) pw = espn.me;

  return {
    totals,
    projected: { me: totals.me + rem.me, opp: totals.opp + rem.opp },
    winPct: Math.round(pw * 100),
    laneTotals,
    out,
    past,
  };
}
