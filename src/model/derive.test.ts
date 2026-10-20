import { expect, it } from 'vitest';
import { mockSlate } from '../sim/mock';
import { bestLineup, erf, fmt, outscoresAStarter, sgn, slotFits, snapshotAt, type Snapshot } from './derive';
import type { BenchSeat, Lane, Player, Pos, Side, Slate } from './types';

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

it('ignores ESPN’s reading for winPct and reports it as espnWinPct instead', () => {
  const slate = { ...HALF, odds: [{ t: 0.3, me: 0.42 }, { t: 0.5, me: 0.6 }] };

  for (const t of [0.06, 0.3, 0.45, 0.7, 1]) {
    expect(snapshotAt(slate, t).winPct).toBe(snapshotAt(HALF, t).winPct);
  }

  for (const t of [0.06, 1]) {
    const snap = snapshotAt(slate, t);
    expect(snap.espnWinPct).toBeUndefined();
    expect('espnWinPct' in snap).toBe(false);
  }
  expect(snapshotAt(slate, 0.3).espnWinPct).toBe(42);
  expect(snapshotAt(slate, 0.45).espnWinPct).toBe(42);
  expect(snapshotAt(slate, 0.7).espnWinPct).toBe(60);
});

it('fits each position only into the slots ESPN allows it', () => {
  expect(slotFits('FLEX', 'TE')).toBe(true);
  expect(slotFits('FLEX', 'QB')).toBe(false);
  expect(slotFits('OP', 'QB')).toBe(true);
  expect(slotFits('RB/WR', 'TE')).toBe(false);
  expect(slotFits('LB', 'DP')).toBe(true);
  expect(slotFits('D/ST', 'DST')).toBe(true);
  expect(slotFits('K', 'WR')).toBe(false);
});

it('flags a benched score that beats a starter in a slot the player could fill', () => {
  const slate = mockSlate('Half PPR');
  const snap = snapshotAt(slate, 1);
  const lowestWr = Math.min(...slate.lanes.flatMap((lane, i) => (slotFits(lane.slot, 'WR') ? [snap.laneTotals[i].me] : [])));
  expect(outscoresAStarter(slate, snap, 'me', 'WR', lowestWr + 0.1)).toBe(true);
  expect(outscoresAStarter(slate, snap, 'me', 'WR', lowestWr)).toBe(false);
  // no lane takes a defensive player, however big the score
  expect(outscoresAStarter(slate, snap, 'me', 'DP', 99)).toBe(false);
});

function P(id: string, pos: Pos, window: [number, number] = [0, 1]): Player {
  return { id, name: id, last: id, pos, team: 'BUF', num: 1, proj: 10, skin: 0, hair: 'bald', window };
}

function laneOf(slot: string, me: Player): Lane {
  return { slot, me, opp: P('o-' + me.id, me.pos) };
}

function testSlate(lanes: Lane[], bench?: Record<Side, BenchSeat[]>): Slate {
  return {
    me: { name: 'Me', owner: 'ME' },
    opp: { name: 'Opp', owner: 'OPP' },
    lanes,
    ...(bench ? { bench } : {}),
    events: [],
    teamColors: {},
    clockLabel: () => '',
    statusLabel: () => '',
    axis: [],
  };
}

function snapOf(me: number[]): Snapshot {
  return {
    totals: { me: me.reduce((a, b) => a + b, 0), opp: 0 },
    projected: { me: 0, opp: 0 },
    winPct: 50,
    laneTotals: me.map(pts => ({ me: pts, opp: 0 })),
    out: new Set(),
    past: [],
  };
}

it('starts a higher-scoring bench player in a legal slot and ignores one of an illegal position', () => {
  const slate = testSlate(
    [laneOf('WR', P('wr1', 'WR')), laneOf('RB', P('rb1', 'RB'))],
    // the K would score more still, but no slot here takes a kicker
    { me: [{ player: P('bench-wr', 'WR'), pts: 20 }, { player: P('bench-k', 'K'), pts: 30 }], opp: [] },
  );
  const snap = snapOf([5, 10]);

  expect(bestLineup(slate, snap, 'me', 1)).toBe(snap.totals.me + 15);
});

it('solves the FLEX assignment exactly where a greedy pass puts the starter in the wrong lane', () => {
  const slate = testSlate(
    // lane order puts FLEX first: greedy drops the 10-point RB there and cannot fit the 9-point WR
    [laneOf('FLEX', P('wr-start', 'WR')), laneOf('RB', P('rb-start', 'RB'))],
    { me: [{ player: P('wr-bench', 'WR'), pts: 9 }, { player: P('rb-bench', 'RB'), pts: 8 }], opp: [] },
  );
  const snap = snapOf([0, 10]);

  expect(bestLineup(slate, snap, 'me', 1)).toBe(19);
});

it('never scores a best lineup below the one actually started', () => {
  const base = mockSlate('Half PPR');
  const slate: Slate = {
    ...base,
    bench: {
      me: [{ player: { ...base.lanes[0].me, id: 'b-me-0' }, pts: 6.5 }, { player: { ...base.lanes[3].me, id: 'b-me-1' }, pts: 4 }],
      opp: [{ player: { ...base.lanes[1].opp, id: 'b-opp-0' }, pts: 5.5 }, { player: { ...base.lanes[4].opp, id: 'b-opp-1' }, pts: 3 }],
    },
  };

  for (const t of [0.3, 0.6, 1]) {
    const snap = snapshotAt(slate, t);
    for (const side of ['me', 'opp'] as Side[]) {
      expect(bestLineup(slate, snap, side, t)).toBeGreaterThanOrEqual(snap.totals[side]);
    }
  }
});

it('has no best lineup to show when the slate carries no bench', () => {
  expect(bestLineup(HALF, snapshotAt(HALF, 0.5), 'me', 0.5)).toBeUndefined();
});

it('scores a bench seat as zero until its game kicks off', () => {
  const slate = testSlate(
    [laneOf('WR', P('wr-start', 'WR'))],
    { me: [{ player: P('wr-bench', 'WR', [0.5, 1]), pts: 10 }], opp: [] },
  );
  const snap = snapOf([2]);

  expect(bestLineup(slate, snap, 'me', 0.2)).toBe(2);
  expect(bestLineup(slate, snap, 'me', 0.6)).toBe(10);
});
