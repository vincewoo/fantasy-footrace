import type { PlayEvent, Pos, Side, Slate } from './types';

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
  espnWinPct?: number;
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

  // ESPN's poll only ever rides along as a second opinion: our variance-additive number stays winPct.
  const espn = t < 1 ? slate.odds?.filter(o => o.t <= t).pop() : undefined;

  return {
    totals,
    projected: { me: totals.me + rem.me, opp: totals.opp + rem.opp },
    winPct: Math.round(pw * 100),
    ...(espn ? { espnWinPct: Math.round(espn.me * 100) } : {}),
    laneTotals,
    out,
    past,
  };
}

// The positions ESPN lets into each lineup slot, keyed by the lane's slot label. Every IDP slot
// takes any defensive player, since a Player only knows it is a DP.
const IDP: Pos[] = ['DP'];
const SLOT_FITS: Record<string, Pos[]> = {
  QB: ['QB'],
  TQB: ['QB'],
  RB: ['RB'],
  'RB/WR': ['RB', 'WR'],
  WR: ['WR'],
  'WR/TE': ['WR', 'TE'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  OP: ['QB', 'RB', 'WR', 'TE'],
  DT: IDP,
  DE: IDP,
  LB: IDP,
  DL: IDP,
  CB: IDP,
  S: IDP,
  DB: IDP,
  DP: IDP,
  'D/ST': ['DST'],
  K: ['K'],
};

export function slotFits(slot: string, pos: Pos): boolean {
  return (SLOT_FITS[slot] ?? []).includes(pos);
}

// True when a benched player's points beat a starter on their side in a slot they could have filled.
export function outscoresAStarter(slate: Slate, snapshot: Snapshot, side: Side, pos: Pos, pts: number): boolean {
  return slate.lanes.some((lane, i) => slotFits(lane.slot, pos) && pts > snapshot.laneTotals[i][side]);
}

// The hindsight-optimal score: the most points the side could have scored had it started its best
// legal lineup from its whole roster. Exact assignment, since FLEX/RB-WR/OP make greedy wrong.
export function bestLineup(slate: Slate, snapshot: Snapshot, side: Side, t: number): number | undefined {
  const bench = slate.bench;
  if (!bench) return undefined;

  const slots: number[] = [];
  const pos: Pos[] = [];
  const pts: number[] = [];
  const own: number[] = [];
  slate.lanes.forEach((lane, i) => {
    const p = lane[side];
    if (p.id === 'empty') return;
    slots.push(i);
    pos.push(p.pos);
    pts.push(snapshot.laneTotals[i][side]);
    own.push(i);
  });
  for (const seat of bench[side]) {
    pos.push(seat.player.pos);
    pts.push(seat.pts !== undefined && t >= seat.player.window[0] ? seat.pts : 0);
    own.push(-1);
  }

  // dp[mask] = best points with exactly the lane slots in mask filled, one player per slot.
  let dp = new Array<number>(1 << slate.lanes.length).fill(-Infinity);
  dp[0] = 0;
  for (let k = 0; k < pos.length; k++) {
    const next = dp.slice();
    for (let mask = 0; mask < dp.length; mask++) {
      if (dp[mask] === -Infinity) continue;
      for (const lane of slots) {
        const bit = 1 << lane;
        if (mask & bit) continue;
        if (!slotFits(slate.lanes[lane].slot, pos[k]) && own[k] !== lane) continue;
        const val = dp[mask] + pts[k];
        if (val > next[mask | bit]) next[mask | bit] = val;
      }
    }
    dp = next;
  }

  // ESPN never leaves a slot empty, so more filled slots beats more points.
  let filled = -1;
  let best = 0;
  for (let mask = 0; mask < dp.length; mask++) {
    if (dp[mask] === -Infinity) continue;
    let n = 0;
    for (let m = mask; m; m &= m - 1) n++;
    if (n > filled || (n === filled && dp[mask] > best)) {
      filled = n;
      best = dp[mask];
    }
  }
  // The started lineup is itself legal, so its total is a floor. Float sums in a different order
  // can land a hair under it; the clamp keeps the shown score honest.
  return Math.max(best, snapshot.totals[side]);
}
