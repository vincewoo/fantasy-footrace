import type { EventKind, PlayEvent, Pos, Side, Slate } from '../model/types';
import type { ScoreAgainst, YardsAgainst } from './summary';

export interface Actual {
  total: number;
  stats: Record<string, number>;
  applied: Record<string, number>;
  proTeamId?: number;
  eventId?: string;
}

export type Note =
  | 'tackle'
  | 'assist'
  | 'stuff'
  | 'pd'
  | 'ff'
  | 'missFG'
  | 'missXP'
  | 'twoPt'
  | 'fumTD';

export interface Piece {
  kind: EventKind;
  yds: number;
  pts: number;
  adjust?: true;
  note?: Note;
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

function eventIdOf(id: unknown): string | undefined {
  const raw = String(id ?? '');
  return /^01\d+$/.test(raw) ? raw.slice(2) : undefined;
}

export function actualOf(player: any, week: number): Actual | null {
  const stats: any[] | undefined = player?.stats;
  if (!Array.isArray(stats)) return null;

  const entry = stats.find(
    (s: any) => s?.statSourceId === 0 && s?.statSplitTypeId === 1 && s?.scoringPeriodId === week,
  );
  if (!entry) return null;

  const actual: Actual = {
    total: round2(Number(entry.appliedTotal) || 0),
    stats: copyNums(entry.stats),
    applied: copyNums(entry.appliedStats),
  };

  const proTeamId = Number(entry.proTeamId);
  if (Number.isFinite(proTeamId)) actual.proTeamId = proTeamId;
  const eventId = eventIdOf(entry.id);
  if (eventId !== undefined) actual.eventId = eventId;

  return actual;
}

interface StatRule {
  stat: string;
  kind: EventKind;
  note?: Note;
  extra?: (stats: Record<string, number>) => number;
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
  {
    stat: '74',
    kind: 'fg',
    extra: s => Math.max(0, num(s, '74') - num(s, '198') - num(s, '201')),
  },
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

const TWO_PT_KIND: Partial<Record<Pos, EventKind>> = {
  QB: 'pass',
  RB: 'rush',
  WR: 'catch',
  TE: 'catch',
};

const IDP_RULES: StatRule[] = [
  { stat: '108', kind: 'rush', note: 'tackle' },
  { stat: '107', kind: 'rush', note: 'assist' },
  { stat: '112', kind: 'rush', note: 'stuff' },
  { stat: '113', kind: 'rush', note: 'pd' },
  { stat: '106', kind: 'fumrec', note: 'ff' },
  { stat: '85', kind: 'rush', note: 'missFG' },
  { stat: '88', kind: 'rush', note: 'missXP' },
  { stat: '19', kind: 'rush', note: 'twoPt' },
  { stat: '26', kind: 'rush', note: 'twoPt' },
  { stat: '44', kind: 'rush', note: 'twoPt' },
  { stat: '63', kind: 'rushTD', note: 'fumTD' },
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

function runPieces(kind: EventKind, yards: number, points: number, count: number): Piece[] {
  const y = Math.round(yards);
  if (y <= 0) return [];

  const n = Math.min(Math.max(1, Math.floor(count)), 8);
  const base = Math.floor(y / n);
  const extra = y % n;
  const pts = spread(points, n);

  return Array.from({ length: n }, (_, i) => ({
    kind,
    yds: i < extra ? base + 1 : base,
    pts: pts[i],
  }));
}

function unitPieces(kind: EventKind, units: number, points: number, note?: Note): Piece[] {
  const n = Math.floor(units);
  if (n <= 0) return [];

  return spread(points, n).map(pts => ({
    kind,
    yds: 0,
    pts,
    ...(note ? { note } : {}),
  }));
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
  const pieceCount = (count: number): number => (count > 0 ? Math.floor(count) : 1);
  const catchCount = (stats: Record<string, number>): number =>
    '53' in stats ? num(stats, '53') : num(stats, '41');

  yardage.push(...runPieces('pass', num(dStats, '3'), num(dApplied, '3'), pieceCount(num(dStats, '1'))));
  yardage.push(...runPieces('rush', num(dStats, '24'), num(dApplied, '24'), pieceCount(num(dStats, '23'))));

  const catchYards = num(dStats, '42');
  const catchPoints = num(dApplied, '42') + num(dApplied, '53');
  if (catchYards > 0) {
    const receptions = prev === null
      ? catchCount(cur.stats)
      : ('53' in cur.stats || '53' in prev.stats ? num(dStats, '53') : num(dStats, '41'));
    yardage.push(...runPieces('catch', catchYards, catchPoints, pieceCount(receptions)));
  } else if (num(dStats, '53') > 0) {
    const n = Math.min(Math.floor(num(dStats, '53')), 8);
    yardage.push(...spread(catchPoints, n).map(pts => ({ kind: 'catch' as EventKind, yds: 0, pts })));
  }

  const specials: Piece[] = [];
  for (const rule of SPECIAL_RULES) {
    const units = rule.extra ? rule.extra(dStats) : num(dStats, rule.stat);
    specials.push(...unitPieces(rule.kind, units, num(dApplied, rule.stat)));
  }
  for (const rule of IDP_RULES) {
    if (Math.abs(num(dApplied, rule.stat)) < 0.005) continue;
    const kind = rule.note === 'twoPt' ? TWO_PT_KIND[pos] ?? rule.kind : rule.kind;
    specials.push(...unitPieces(kind, Math.min(num(dStats, rule.stat), 8), num(dApplied, rule.stat), rule.note));
  }

  let pieces: Piece[];
  if (prev === null) {
    const n = yardage.length;
    const k = specials.length;
    pieces = [...yardage];
    for (let j = 0; j < k; j += 1) {
      pieces.splice(Math.floor(((j + 1) * n) / (k + 1)) + j, 0, specials[j]);
    }
  } else {
    pieces = [...yardage, ...specials];
  }

  const sum = pieces.reduce((total, piece) => total + piece.pts, 0);
  const rem = round2(dTotal - sum);

  if (pos === 'DST' || pos === 'DP') {
    if (pieces.length > 0) {
      if (Math.abs(rem) >= 0.005) pieces.push({ kind: 'rush', yds: 0, pts: rem, adjust: true });
      return pieces;
    }
    if (Math.abs(dTotal) >= 0.005) return [{ kind: 'rush', yds: 0, pts: dTotal, adjust: true }];
    return [];
  }

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

export function describeNote(note: Note, name: string): string {
  switch (note) {
    case 'tackle': return `${name} makes a tackle`;
    case 'assist': return `${name} assists on a tackle`;
    case 'stuff': return `${name} stuffs the runner`;
    case 'pd': return `${name} breaks up a pass`;
    case 'ff': return `${name} forces a fumble`;
    case 'missFG': return `${name} misses a field goal`;
    case 'missXP': return `${name} misses the extra point`;
    case 'twoPt': return `${name} converts the two-point try`;
    case 'fumTD': return `${name} scoops it in for a TD!`;
  }
}

export function describeAdjust(pos: Pos, name: string, pts: number): string {
  if (pos === 'DST') return pts < 0 ? `${name} give up points` : `${name} tighten up`;
  if (pos === 'DP') return pts < 0 ? `${name} loses points` : `${name} makes a stop`;
  return `${name} ${pts < 0 ? 'loses' : 'gains'} points`;
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
      if (actual) {
        if (actual.eventId === undefined) {
          const eventId = eventIdOf(player?.id);
          if (eventId !== undefined) actual.eventId = eventId;
        }
        if (actual.proTeamId === undefined && Number.isFinite(Number(player?.proTeamId))) {
          actual.proTeamId = Number(player?.proTeamId);
        }
        actuals[id] = actual;
      }
      if (player?.injuryStatus === 'OUT') out.push(id);
    }
  }

  return { actuals, out };
}

const SIDES: Side[] = ['me', 'opp'];

export interface DstTier {
  min: number;
  max: number;
  pts: number;
}

export interface DstTiers {
  pa: DstTier[];
  ya: DstTier[];
}

export interface DstHistory {
  tiers: DstTiers;
  plays: ScoreAgainst[];
  gNow: number;
  drives?: YardsAgainst[];
}

const PA_RANGES: [string, number, number][] = [
  ['89', 0, 0],
  ['90', 1, 6],
  ['91', 7, 13],
  ['92', 14, 17],
  ['121', 18, 21],
  ['122', 22, 27],
  ['123', 28, 34],
  ['124', 35, 45],
  ['125', 46, Infinity],
];

const YA_RANGES: [string, number, number][] = [
  ['128', 0, 99],
  ['129', 100, 199],
  ['130', 200, 299],
  ['131', 300, 349],
  ['132', 350, 399],
  ['133', 400, 449],
  ['134', 450, 499],
  ['135', 500, 549],
  ['136', 550, Infinity],
];

function tierPointsOf(stat: string, min: number, max: number, pointsByStat: Record<string, number>): DstTier {
  return { min, max, pts: pointsByStat[stat] ?? 0 };
}

function pointsByStat(scoringItems: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of scoringItems ?? []) {
    const id = String(item?.statId);
    const override = item?.pointsOverrides?.['16'];
    const pts = typeof override === 'number' ? override : Number(item?.points);
    if (Number.isFinite(pts)) out[id] = pts;
  }
  return out;
}

export function dstTiers(scoringItems: any[]): DstTiers {
  const points = pointsByStat(scoringItems ?? []);
  return {
    pa: PA_RANGES.map(([stat, min, max]) => tierPointsOf(stat, min, max, points)),
    ya: YA_RANGES.map(([stat, min, max]) => tierPointsOf(stat, min, max, points)),
  };
}

export function tierPoints(tiers: DstTier[], value: number): number {
  const tier = tiers.find(t => value >= t.min && value <= t.max);
  return tier ? tier.pts : 0;
}

function dstHistoryEvents(
  history: DstHistory,
  name: string,
  cur: Actual,
  w0: number,
  w1: number,
  tNow: number,
): { kind: EventKind; yds: number; pts: number; t: number; text: string }[] {
  const end = Math.min(Math.max(tNow, w0), w1);
  const events: { kind: EventKind; yds: number; pts: number; t: number; text: string }[] = [{
    kind: 'rush',
    yds: 0,
    pts: round2(tierPoints(history.tiers.pa, 0) + tierPoints(history.tiers.ya, 0)),
    t: w0,
    text: `${name} take the field`,
  }];

  let prevPa = 0;
  for (const play of history.plays) {
    const pts = round2(tierPoints(history.tiers.pa, play.pa) - tierPoints(history.tiers.pa, prevPa));
    prevPa = play.pa;
    const g = history.gNow > 0 ? play.g / history.gNow : 1;
    events.push({
      kind: 'rush',
      yds: 0,
      pts,
      t: Math.min(w0 + g * (end - w0), end),
      text: `${name} allow a score (${play.pa} allowed)`,
    });
  }

  let prevYa = 0;
  for (const drive of history.drives ?? []) {
    const pts = round2(tierPoints(history.tiers.ya, drive.ya) - tierPoints(history.tiers.ya, prevYa));
    if (Math.abs(pts) >= 0.005) {
      const g = drive.g === null || history.gNow <= 0 ? 1 : drive.g / history.gNow;
      events.push({
        kind: 'rush',
        yds: 0,
        pts,
        t: Math.min(w0 + g * (end - w0), end),
        text: pts < 0
          ? `${name} give up yards (${drive.ya} allowed)`
          : `${name} tighten up (${drive.ya} allowed)`,
      });
    }
    prevYa = drive.ya;
  }

  const pieces = decompose('DST', null, cur).filter(piece => piece.adjust === undefined);
  const n = pieces.length;
  pieces.forEach((piece, j) => {
    events.push({
      kind: piece.kind,
      yds: piece.yds,
      pts: piece.pts,
      t: w0 + ((j + 1) / (n + 1)) * (end - w0),
      text: describeLive(piece.kind, name, piece.yds),
    });
  });

  const sum = events.reduce((total, event) => total + event.pts, 0);
  const rem = round2(cur.total - sum);
  if (Math.abs(rem) >= 0.005) {
    events.push({
      kind: 'rush',
      yds: 0,
      pts: rem,
      t: end,
      text: rem < 0 ? `${name} give up yards` : `${name} tighten up`,
    });
  }

  return events;
}

export function eventsFromPoll(
  slate: Slate,
  prev: PollState | null,
  cur: PollState,
  tNow: number,
  firstId: number,
  history?: Record<string, DstHistory>,
): PlayEvent[] {
  const draft: {
    t: number; side: Side; lane: number; kind: EventKind; yds: number; pts: number;
    name: string; pos: Pos; text?: string; adjust?: true; note?: Note;
  }[] = [];

  slate.lanes.forEach((lane, i) => {
    for (const side of SIDES) {
      const player = lane[side];
      if (player.id === 'empty') continue;

      const id = player.id;
      const name = player.pos === 'DST' ? player.name : player.last;
      const first = prev === null || !(id in prev.actuals);
      const [w0, w1] = player.window;
      const curOut = cur.out.includes(id);
      const prevOut = prev !== null && prev.out.includes(id);

      if (curOut && !prevOut) {
        draft.push({ t: first ? w0 : Math.max(tNow, w0), side, lane: i, kind: 'injury', yds: 0, pts: 0, name, pos: player.pos });
      }

      const actual = cur.actuals[id];
      if (!actual) continue;

      const dstHistory = player.pos === 'DST' && first ? history?.[id] : undefined;
      if (dstHistory) {
        for (const event of dstHistoryEvents(dstHistory, name, actual, w0, w1, tNow)) {
          draft.push({ ...event, side, lane: i, name, pos: player.pos });
        }
        continue;
      }

      const pieces = decompose(player.pos, first ? null : prev!.actuals[id], actual);
      if (pieces.length === 0) continue;

      const n = pieces.length;
      pieces.forEach((piece, j) => {
        const t = first
          ? w0 + ((j + 1) / (n + 1)) * (Math.min(Math.max(tNow, w0), w1) - w0)
          : Math.max(tNow, w0) + (j + 1) * 1e-6;
        draft.push({ t, side, lane: i, kind: piece.kind, yds: piece.yds, pts: piece.pts, name, pos: player.pos, adjust: piece.adjust, note: piece.note });
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
    text: e.text
      ?? (e.adjust
        ? describeAdjust(e.pos, e.name, e.pts)
        : e.note
          ? describeNote(e.note, e.name)
          : describeLive(e.kind, e.name, e.yds)),
  }));
}

export function withEvents(slate: Slate, events: PlayEvent[]): Slate {
  const merged = [...slate.events, ...events];
  merged.sort((a, b) => a.t - b.t);

  return { ...slate, events: merged };
}
