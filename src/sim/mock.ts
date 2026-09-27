import type { EventKind, Lane, Player, PlayEvent, Pos, Side, Slate, TeamColors } from '../model/types';

export type Scoring = 'PPR' | 'Half PPR' | 'Standard';

const BK = '#1d1411';
const SIDES: Side[] = ['me', 'opp'];

const WINDOWS: [number, number][] = [
  [0.005, 0.29],
  [0.325, 0.6],
  [0.7, 0.985],
];

const TEAMS: Record<string, TeamColors & { w: number }> = {
  BUF: { c1: '#00338D', c2: '#C60C30', w: 0 },
  ATL: { c1: '#A71930', c2: '#1b1b1b', w: 0 },
  DET: { c1: '#0076B6', c2: '#B0B7BC', w: 2 },
  CIN: { c1: '#FB4F14', c2: '#1b1b1b', w: 0 },
  LAR: { c1: '#003594', c2: '#FFA300', w: 1 },
  LV: { c1: '#1b1b1b', c2: '#A5ACAF', w: 1 },
  NYG: { c1: '#0B2265', c2: '#A71930', w: 0 },
  DAL: { c1: '#041E42', c2: '#869397', w: 1 },
  DEN: { c1: '#FB4F14', c2: '#002244', w: 0 },
  BAL: { c1: '#241773', c2: '#9E7C0C', w: 0 },
  PHI: { c1: '#004C54', c2: '#A5ACAF', w: 1 },
  MIN: { c1: '#4F2683', c2: '#FFC62F', w: 0 },
  ARI: { c1: '#97233F', c2: '#1b1b1b', w: 1 },
  LAC: { c1: '#0080C6', c2: '#FFC20E', w: 1 },
  PIT: { c1: '#1b1b1b', c2: '#FFB612', w: 0, numC: '#FFB612' },
};

type RosterPlayer = Omit<Player, 'id' | 'window'> & { slot: string; injuryAt?: number };

const ROSTER: Record<Side, RosterPlayer[]> = {
  me: [
    { slot: 'QB', pos: 'QB', name: 'Josh Allen', last: 'Allen', team: 'BUF', num: 17, proj: 22.4, skin: 0, hair: 'short', hc: '#5a3a22', beard: true },
    { slot: 'RB', pos: 'RB', name: 'Bijan Robinson', last: 'Bijan', team: 'ATL', num: 7, proj: 18.6, skin: 3, hair: 'locs', hc: BK },
    { slot: 'RB', pos: 'RB', name: 'Jahmyr Gibbs', last: 'Gibbs', team: 'DET', num: 26, proj: 17.2, skin: 3, hair: 'locs', hc: BK },
    { slot: 'WR', pos: 'WR', name: "Ja'Marr Chase", last: 'Chase', team: 'CIN', num: 1, proj: 18.1, skin: 3, hair: 'fade', hc: BK, beard: true },
    { slot: 'WR', pos: 'WR', name: 'Puka Nacua', last: 'Nacua', team: 'LAR', num: 12, proj: 16.4, skin: 1, hair: 'short', hc: BK },
    { slot: 'TE', pos: 'TE', name: 'Brock Bowers', last: 'Bowers', team: 'LV', num: 89, proj: 13.2, skin: 0, hair: 'curly', hc: '#d4a650' },
    { slot: 'FLEX', pos: 'WR', name: 'Malik Nabers', last: 'Nabers', team: 'NYG', num: 1, proj: 15.3, skin: 3, hair: 'locs', hc: BK },
    { slot: 'K', pos: 'K', name: 'Brandon Aubrey', last: 'Aubrey', team: 'DAL', num: 17, proj: 9.1, skin: 0, hair: 'short', hc: '#7a5534' },
    { slot: 'D/ST', pos: 'DST', name: 'Broncos D/ST', last: 'Broncos D', tag: 'DEN D', team: 'DEN', num: 'D', proj: 8.2, skin: 2, hair: 'helmet' },
  ],
  opp: [
    { slot: 'QB', pos: 'QB', name: 'Lamar Jackson', last: 'Jackson', team: 'BAL', num: 8, proj: 23.0, skin: 3, hair: 'fade', hc: BK, beard: true },
    { slot: 'RB', pos: 'RB', name: 'Saquon Barkley', last: 'Barkley', team: 'PHI', num: 26, proj: 18.4, skin: 2, hair: 'buzz', hc: BK },
    { slot: 'RB', pos: 'RB', name: 'Derrick Henry', last: 'Henry', team: 'BAL', num: 22, proj: 15.8, skin: 4, hair: 'locs', hc: BK, beard: true, injuryAt: 0.42 },
    { slot: 'WR', pos: 'WR', name: 'Justin Jefferson', last: 'Jefferson', team: 'MIN', num: 18, proj: 17.6, skin: 2, hair: 'curly', hc: BK },
    { slot: 'WR', pos: 'WR', name: 'CeeDee Lamb', last: 'Lamb', team: 'DAL', num: 88, proj: 17.0, skin: 3, hair: 'fade', hc: BK },
    { slot: 'TE', pos: 'TE', name: 'Trey McBride', last: 'McBride', team: 'ARI', num: 85, proj: 12.1, skin: 0, hair: 'short', hc: '#6b4a2e', beard: true },
    { slot: 'FLEX', pos: 'WR', name: 'Amon-Ra St. Brown', last: 'St. Brown', tag: 'ST.BROWN', team: 'DET', num: 14, proj: 15.9, skin: 1, hair: 'curly', hc: '#2a1d15' },
    { slot: 'K', pos: 'K', name: 'Cameron Dicker', last: 'Dicker', team: 'LAC', num: 11, proj: 8.7, skin: 0, hair: 'short', hc: '#8a6a45' },
    { slot: 'D/ST', pos: 'DST', name: 'Steelers D/ST', last: 'Steelers D', tag: 'PIT D', team: 'PIT', num: 'D', proj: 7.6, skin: 2, hair: 'helmet' },
  ],
};

const AXIS: { label: string; t: number }[] = [
  { label: '1 PM', t: 0 },
  { label: '4 PM', t: 0.286 },
  { label: 'SNF', t: 0.698 },
  { label: 'END', t: 1 },
];

interface RawPlay {
  kind: EventKind;
  yds: number;
}

interface RawEvent extends RawPlay {
  t: number;
  side: Side;
  lane: number;
}

export function mulberry(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scorePlay(kind: EventKind, yds: number, mode: Scoring): number {
  const rec = mode === 'PPR' ? 1 : mode === 'Standard' ? 0 : 0.5;
  switch (kind) {
    case 'pass': return yds * 0.04;
    case 'passTD': return yds * 0.04 + 4;
    case 'int': return -2;
    case 'rush': return yds * 0.1;
    case 'rushTD': return yds * 0.1 + 6;
    case 'catch': return rec + yds * 0.1;
    case 'recTD': return rec + yds * 0.1 + 6;
    case 'fumble': return -2;
    case 'fg': return yds < 40 ? 3 : yds < 50 ? 4 : 5;
    case 'xp': return 1;
    case 'sack': return 1;
    case 'dint': return 2;
    case 'fumrec': return 2;
    case 'dtd': return 6;
    default: return 0;
  }
}

function pick(pos: Pos, rng: () => number): RawPlay {
  const r = rng();
  const y = (lo: number, hi: number) => Math.round(lo + rng() * (hi - lo));
  if (pos === 'QB') {
    return r < 0.6 ? { kind: 'pass', yds: y(6, 38) }
      : r < 0.74 ? { kind: 'passTD', yds: y(4, 48) }
      : r < 0.84 ? { kind: 'rush', yds: y(3, 16) }
      : r < 0.89 ? { kind: 'rushTD', yds: y(1, 9) }
      : { kind: 'int', yds: 0 };
  }
  if (pos === 'RB') {
    return r < 0.58 ? { kind: 'rush', yds: y(2, 19) }
      : r < 0.8 ? { kind: 'catch', yds: y(3, 22) }
      : r < 0.92 ? { kind: 'rushTD', yds: y(1, 14) }
      : r < 0.95 ? { kind: 'recTD', yds: y(5, 30) }
      : { kind: 'fumble', yds: 0 };
  }
  if (pos === 'WR' || pos === 'TE') {
    return r < 0.76 ? { kind: 'catch', yds: y(5, 34) }
      : r < 0.9 ? { kind: 'recTD', yds: y(6, 55) }
      : r < 0.95 ? { kind: 'rush', yds: y(3, 14) }
      : { kind: 'fumble', yds: 0 };
  }
  if (pos === 'K') return r < 0.45 ? { kind: 'xp', yds: 0 } : { kind: 'fg', yds: y(24, 58) };
  return r < 0.5 ? { kind: 'sack', yds: 0 }
    : r < 0.75 ? { kind: 'dint', yds: 0 }
    : r < 0.92 ? { kind: 'fumrec', yds: 0 }
    : { kind: 'dtd', yds: 0 };
}

function genEvents(rng: () => number): RawEvent[] {
  const out: RawEvent[] = [];
  for (const side of SIDES) {
    ROSTER[side].forEach((p, lane) => {
      const [a, b] = WINDOWS[TEAMS[p.team].w];
      const target = p.proj * (0.5 + rng() * 1.1);
      const list: RawPlay[] = [];
      let pts = 0;
      while (pts < target && list.length < 18) {
        const play = pick(p.pos, rng);
        list.push(play);
        pts += scorePlay(play.kind, play.yds, 'Half PPR');
      }
      const times = list.map(() => a + rng() * (b - a)).sort((x, y) => x - y);
      const placed = list.map((play, j): RawEvent => ({ ...play, t: times[j], side, lane }));
      if (p.injuryAt) {
        const cut = a + p.injuryAt * (b - a);
        out.push(...placed.filter(e => e.t < cut), { kind: 'injury', yds: 0, t: cut, side, lane });
      } else out.push(...placed);
    });
  }
  out.sort((x, y) => x.t - y.t);
  return out;
}

function describe(kind: EventKind, last: string, yds: number): string {
  switch (kind) {
    case 'pass': return `${last} dials up a ${yds}-yd strike`;
    case 'passTD': return `${last} TD pass! ${yds} yds to paydirt`;
    case 'int': return `${last} throws a pick. Yikes.`;
    case 'rush': return `${last} rumbles for ${yds} yds`;
    case 'rushTD': return `${last} plows in from ${yds} out. TD!`;
    case 'catch': return `${last} hauls in ${yds} yds`;
    case 'recTD': return `${last} ${yds}-yd TD grab!`;
    case 'fumble': return `${last} coughs it up. Fumble lost.`;
    case 'fg': return `${last} drills a ${yds}-yd field goal`;
    case 'xp': return `${last} extra point is good`;
    case 'sack': return `${last} bring the heat. Sack!`;
    case 'dint': return `${last} jump the route. Picked off!`;
    case 'fumrec': return `${last} scoop up a loose ball`;
    case 'dtd': return `${last} pick-six! Defensive TD!`;
    case 'injury': return `${last} limps off. Ruled OUT.`;
  }
}

function clock(t: number): string {
  const m = Math.round(13 * 60 + t * 630);
  let hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const ap = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${hh}:${String(mm).padStart(2, '0')} ${ap}`;
}

function status(p: Player, t: number): string {
  const [a, b] = p.window;
  if (t < a) return `KO ${clock(a)}`;
  if (t >= b) return 'FINAL';
  const f = (t - a) / (b - a);
  const q = Math.min(4, Math.floor(f * 4) + 1);
  const rs = Math.max(0, Math.round((1 - ((f * 4) % 1)) * 900));
  return `Q${q} ${Math.floor(rs / 60)}:${String(rs % 60).padStart(2, '0')}`;
}

function toPlayer(side: Side, lane: number, rp: RosterPlayer): Player {
  const { slot, injuryAt, ...rest } = rp;
  return { ...rest, id: `${side}${lane}`, window: WINDOWS[TEAMS[rp.team].w] };
}

export function mockSlate(scoring: Scoring): Slate {
  const rng = mulberry(20260927);
  const events: PlayEvent[] = genEvents(rng).map((e, j) => ({
    id: j + 1,
    t: e.t,
    side: e.side,
    lane: e.lane,
    kind: e.kind,
    yds: e.yds,
    pts: Math.round(scorePlay(e.kind, e.yds, scoring) * 100) / 100,
    text: describe(e.kind, ROSTER[e.side][e.lane].last, e.yds),
  }));

  const lanes: Lane[] = ROSTER.me.map((pm, i) => ({
    slot: pm.slot,
    me: toPlayer('me', i, pm),
    opp: toPlayer('opp', i, ROSTER.opp[i]),
  }));

  const teamColors: Record<string, TeamColors> = {};
  for (const [abbr, c] of Object.entries(TEAMS)) {
    teamColors[abbr] = c.numC ? { c1: c.c1, c2: c.c2, numC: c.numC } : { c1: c.c1, c2: c.c2 };
  }

  return {
    me: { name: 'Hail Mary Poppins', owner: 'YOU' },
    opp: { name: 'The Kupp Runneth Over', owner: 'DAVE' },
    lanes,
    events,
    teamColors,
    clockLabel: clock,
    statusLabel: status,
    axis: AXIS,
  };
}
