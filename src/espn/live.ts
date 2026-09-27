import type { EventKind, PlayEvent, Pos, Side, Slate } from '../model/types';

export interface Actual {
  total: number;
  stats: Record<string, number>;
  applied: Record<string, number>;
}

export interface Piece {
  kind: EventKind;
  yds: number;
  pts: number;
}

export interface PollState {
  actuals: Record<string, Actual>;
  out: string[];
}

const BENCH_SLOTS = new Set([20, 21]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(map: Record<string, number>, key: string): number {
  const v = map[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function copyNums(source: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!source || typeof source !== 'object') return out;
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

export function actualOf(player: any, week: number): Actual | null {
  const stats: any[] | undefined = player?.stats;
  if (!Array.isArray(stats)) return null;

  const entry = stats.find(
    (s: any) => s?.statSourceId === 0 && s?.statSplitTypeId === 1 && s?.scoringPeriodId === week,
  );
  if (!entry) return null;

  return {
    total: round2(Number(entry.appliedTotal) || 0),
    stats: copyNums(entry.stats),
    applied: copyNums(entry.appliedStats),
  };
}

interface StatRule {
  stat: string;
  kind: EventKind;
}

const TD_RULES: StatRule[] = [
  { stat: '4', kind: 'passTD' },
  { stat: '25', kind: 'rushTD' },
  { stat: '43', kind: 'recTD' },
];

const TURNOVER_RULES: StatRule[] = [
  { stat: '20', kind: 'int' },
  { stat: '72', kind: 'fumble' },
];

const KICK_RULES: StatRule[] = [
  { stat: '74', kind: 'fg' },
  { stat: '77', kind: 'fg' },
  { stat: '80', kind: 'fg' },
  { stat: '198', kind: 'fg' },
  { stat: '201', kind: 'fg' },
  { stat: '86', kind: 'xp' },
];

const DEFENSE_RULES: StatRule[] = [
  { stat: '99', kind: 'sack' },
  { stat: '95', kind: 'dint' },
  { stat: '96', kind: 'fumrec' },
  { stat: '93', kind: 'dtd' },
  { stat: '94', kind: 'dtd' },
  { stat: '101', kind: 'dtd' },
  { stat: '102', kind: 'dtd' },
  { stat: '103', kind: 'dtd' },
  { stat: '104', kind: 'dtd' },
];

const SPECIAL_RULES: StatRule[] = [...TD_RULES, ...TURNOVER_RULES, ...KICK_RULES, ...DEFENSE_RULES];

const FALLBACK_KIND: Record<Pos, EventKind> = {
  QB: 'pass',
  RB: 'rush',
  WR: 'catch',
  TE: 'catch',
  K: 'xp',
  DST: 'sack',
  DP: 'sack',
};

function spread(total: number, n: number): number[] {
  const each = round2(total / n);
  const pts: number[] = [];
  let used = 0;
  for (let i = 0; i < n; i += 1) {
    if (i === n - 1) {
      pts.push(round2(total - used));
      break;
    }
    pts.push(each);
    used = round2(used + each);
  }
  return pts;
}

function runPieces(kind: EventKind, yards: number, points: number): Piece[] {
  const y = Math.round(yards);
  if (y <= 0) return [];

  const n = Math.min(Math.max(1, Math.round(y / 15)), 8);
  const base = Math.floor(y / n);
  const extra = y % n;
  const pts = spread(points, n);

  return Array.from({ length: n }, (_, i) => ({
    kind,
    yds: i < extra ? base + 1 : base,
    pts: pts[i],
  }));
}

function unitPieces(kind: EventKind, units: number, points: number): Piece[] {
  const n = Math.floor(units);
  if (n <= 0) return [];

  return spread(points, n).map(pts => ({ kind, yds: 0, pts }));
}

export function decompose(pos: Pos, prev: Actual | null, cur: Actual): Piece[] {
  const dStats: Record<string, number> = {};
  const dApplied: Record<string, number> = {};
  const keys = new Set([
    ...Object.keys(cur.stats),
    ...Object.keys(cur.applied),
    ...Object.keys(prev?.stats ?? {}),
    ...Object.keys(prev?.applied ?? {}),
  ]);
  for (const key of keys) {
    dStats[key] = num(cur.stats, key) - num(prev?.stats ?? {}, key);
    dApplied[key] = num(cur.applied, key) - num(prev?.applied ?? {}, key);
  }
  const dTotal = round2(cur.total - (prev?.total ?? 0));

  const hasGain = Object.values(dStats).some(v => v > 0);
  if (Math.abs(dTotal) < 0.005 && !hasGain) return [];

  const yardage: Piece[] = [];
  yardage.push(...runPieces('pass', num(dStats, '3'), num(dApplied, '3')));
  yardage.push(...runPieces('rush', num(dStats, '24'), num(dApplied, '24')));

  const catchYards = num(dStats, '42');
  const catchPoints = num(dApplied, '42') + num(dApplied, '53');
  if (catchYards > 0) yardage.push(...runPieces('catch', catchYards, catchPoints));
  else if (num(dStats, '53') > 0) {
    const n = Math.min(Math.floor(num(dStats, '53')), 8);
    yardage.push(...spread(catchPoints, n).map(pts => ({ kind: 'catch' as EventKind, yds: 0, pts })));
  }

  const specials: Piece[] = [];
  for (const rule of SPECIAL_RULES) {
    specials.push(...unitPieces(rule.kind, num(dStats, rule.stat), num(dApplied, rule.stat)));
  }

  const n = yardage.length;
  const k = specials.length;
  const pieces = [...yardage];
  for (let j = 0; j < k; j += 1) {
    pieces.splice(Math.floor(((j + 1) * n) / (k + 1)) + j, 0, specials[j]);
  }

  const sum = pieces.reduce((total, piece) => total + piece.pts, 0);
  const rem = round2(dTotal - sum);

  if (pieces.length > 0) {
    if (Math.abs(rem) >= 0.005) {
      const last = pieces.length - 1;
      pieces[last] = { ...pieces[last], pts: round2(pieces[last].pts + rem) };
    }
    return pieces;
  }

  if (Math.abs(dTotal) >= 0.005) return [{ kind: FALLBACK_KIND[pos], yds: 0, pts: dTotal }];
  return [];
}

const ZERO_YDS: Partial<Record<EventKind, string>> = {
  pass: 'completes a pass',
  rush: 'runs it',
  catch: 'hauls one in',
};

export function describeLive(kind: EventKind, last: string, yds: number): string {
  if (yds === 0 && kind in ZERO_YDS) return `${last} ${ZERO_YDS[kind]}`;

  switch (kind) {
    case 'pass': return `${last} completes ${yds} yds`;
    case 'passTD': return `${last} throws a TD!`;
    case 'int': return `${last} throws a pick`;
    case 'rush': return `${last} runs for ${yds} yds`;
    case 'rushTD': return `${last} punches it in. TD!`;
    case 'catch': return `${last} hauls in ${yds} yds`;
    case 'recTD': return `${last} catches a TD!`;
    case 'fumble': return `${last} fumbles it away`;
    case 'fg': return `${last} drills a field goal`;
    case 'xp': return `${last} extra point is good`;
    case 'sack': return `${last} bring the heat`;
    case 'dint': return `${last} pick one off`;
    case 'fumrec': return `${last} recover a fumble`;
    case 'dtd': return `${last} defensive TD!`;
    default: return `${last} ruled OUT`;
  }
}

function startersOf(side: any): any[] {
  const entries = side?.rosterForCurrentScoringPeriod?.entries ?? [];
  return entries.filter((e: any) => !BENCH_SLOTS.has(e?.lineupSlotId));
}

export function readPoll(schedule: any[], myTeamId: number, week: number): PollState {
  const entry = (schedule ?? []).find(
    (m: any) => m?.home?.teamId === myTeamId || m?.away?.teamId === myTeamId,
  );
  if (!entry) throw new Error('no matchup for team ' + myTeamId);

  const actuals: Record<string, Actual> = {};
  const out: string[] = [];
  for (const side of [entry.home, entry.away]) {
    for (const entryOf of startersOf(side)) {
      const player = entryOf?.playerPoolEntry?.player;
      const id = String(player?.id);
      const actual = actualOf(player, week);
      if (actual) actuals[id] = actual;
      if (player?.injuryStatus === 'OUT') out.push(id);
    }
  }

  return { actuals, out };
}

const SIDES: Side[] = ['me', 'opp'];

export function eventsFromPoll(
  slate: Slate,
  prev: PollState | null,
  cur: PollState,
  tNow: number,
  firstId: number,
): PlayEvent[] {
  const draft: { t: number; side: Side; lane: number; kind: EventKind; yds: number; pts: number; last: string }[] = [];

  slate.lanes.forEach((lane, i) => {
    for (const side of SIDES) {
      const player = lane[side];
      if (player.id === 'empty') continue;

      const id = player.id;
      const first = prev === null || !(id in prev.actuals);
      const [w0, w1] = player.window;
      const curOut = cur.out.includes(id);
      const prevOut = prev !== null && prev.out.includes(id);

      if (curOut && !prevOut) {
        draft.push({ t: first ? w0 : Math.max(tNow, w0), side, lane: i, kind: 'injury', yds: 0, pts: 0, last: player.last });
      }

      const actual = cur.actuals[id];
      if (!actual) continue;

      const pieces = decompose(player.pos, first ? null : prev!.actuals[id], actual);
      if (pieces.length === 0) continue;

      const n = pieces.length;
      pieces.forEach((piece, j) => {
        const t = first
          ? w0 + ((j + 1) / (n + 1)) * (Math.min(Math.max(tNow, w0), w1) - w0)
          : Math.max(tNow, w0) + (j + 1) * 1e-6;
        draft.push({ t, side, lane: i, kind: piece.kind, yds: piece.yds, pts: piece.pts, last: player.last });
      });
    }
  });

  draft.sort((a, b) => a.t - b.t);

  return draft.map((e, index) => ({
    id: firstId + index,
    t: e.t,
    side: e.side,
    lane: e.lane,
    kind: e.kind,
    yds: e.yds,
    pts: e.pts,
    text: describeLive(e.kind, e.last, e.yds),
  }));
}

export function withEvents(slate: Slate, events: PlayEvent[]): Slate {
  const merged = [...slate.events, ...events];
  merged.sort((a, b) => a.t - b.t);

  return { ...slate, events: merged };
}
