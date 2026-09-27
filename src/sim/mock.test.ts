import { expect, it } from 'vitest';
import { fmt, snapshotAt } from '../model/derive';
import type { EventKind } from '../model/types';
import { mockSlate, type Scoring } from './mock';

const MODES: Scoring[] = ['PPR', 'Half PPR', 'Standard'];

it('generates the design\u2019s 135 events in every scoring mode', () => {
  for (const mode of MODES) expect(mockSlate(mode).events).toHaveLength(135);
});

it('generates the design\u2019s kind counts, ids and time order', () => {
  const events = mockSlate('Half PPR').events;
  const counts: Record<EventKind, number> = {
    pass: 0, passTD: 0, int: 0, rush: 0, rushTD: 0, catch: 0, recTD: 0, fumble: 0,
    fg: 0, xp: 0, sack: 0, dint: 0, fumrec: 0, dtd: 0, injury: 0,
  };
  for (const e of events) counts[e.kind] += 1;

  expect(counts).toEqual({
    pass: 24, passTD: 3, int: 3, rush: 24, rushTD: 5, catch: 39, recTD: 10, fumble: 7,
    fg: 5, xp: 2, sack: 6, dint: 2, fumrec: 4, dtd: 0, injury: 1,
  });
  expect(events.map(e => e.id)).toEqual(events.map((_, j) => j + 1));
  expect(events.map(e => e.t)).toEqual([...events].map(e => e.t).sort((x, y) => x - y));
});

it('matches the design\u2019s first and last event', () => {
  const half = mockSlate('Half PPR').events;
  const first = half[0];
  const last = half[134];

  expect({ id: first.id, kind: first.kind, yds: first.yds, side: first.side, lane: first.lane, pts: first.pts, text: first.text })
    .toEqual({ id: 1, kind: 'pass', yds: 16, side: 'me', lane: 0, pts: 0.64, text: 'Allen dials up a 16-yd strike' });

  expect({ id: last.id, kind: last.kind, yds: last.yds, side: last.side, lane: last.lane, text: last.text })
    .toEqual({ id: 135, kind: 'catch', yds: 24, side: 'opp', lane: 6, text: 'St. Brown hauls in 24 yds' });

  expect([half[134].pts, mockSlate('PPR').events[134].pts, mockSlate('Standard').events[134].pts])
    .toEqual([2.9, 3.4, 2.4]);
});

it('matches the design\u2019s final totals in every scoring mode', () => {
  const pinned: [Scoring, string, string][] = [
    ['PPR', '188.5', '140.4'],
    ['Half PPR', '172.0', '132.4'],
    ['Standard', '155.5', '124.4'],
  ];

  for (const [mode, me, opp] of pinned) {
    const { totals } = snapshotAt(mockSlate(mode), 1);
    expect([fmt(totals.me), fmt(totals.opp)]).toEqual([me, opp]);
  }
});

it('labels the clock, player status and scrubber axis like the design', () => {
  const slate = mockSlate('Half PPR');
  const allen = slate.lanes[0].me;

  expect([slate.clockLabel(0), slate.clockLabel(0.5), slate.clockLabel(1)]).toEqual(['1:00 PM', '6:15 PM', '11:30 PM']);
  expect([slate.statusLabel(allen, 0), slate.statusLabel(allen, 0.1), slate.statusLabel(allen, 0.5)]).toEqual(['KO 1:03 PM', 'Q2 10:00', 'FINAL']);
  expect(slate.axis).toEqual([
    { label: '1 PM', t: 0 },
    { label: '4 PM', t: 0.286 },
    { label: 'SNF', t: 0.698 },
    { label: 'END', t: 1 },
  ]);
});

it('builds the design\u2019s lanes with team windows', () => {
  const slate = mockSlate('Half PPR');

  expect(slate.lanes.map(l => l.me.id)).toEqual(slate.lanes.map((_, i) => `me${i}`));
  expect(slate.lanes.map(l => l.opp.id)).toEqual(slate.lanes.map((_, i) => `opp${i}`));
  expect(slate.lanes[0]).toMatchObject({
    slot: 'QB',
    me: { name: 'Josh Allen', team: 'BUF', window: [0.005, 0.29] },
    opp: { name: 'Lamar Jackson', team: 'BAL', window: [0.005, 0.29] },
  });
  expect(slate.lanes[2].me.window).toEqual([0.7, 0.985]);
  expect(slate.me).toEqual({ name: 'Hail Mary Poppins', owner: 'YOU' });
  expect(slate.opp).toEqual({ name: 'The Kupp Runneth Over', owner: 'DAVE' });
});

it('is pure: two calls return equal slates', () => {
  const a = mockSlate('PPR');
  const b = mockSlate('PPR');

  expect({ me: a.me, opp: a.opp, lanes: a.lanes, events: a.events, teamColors: a.teamColors, axis: a.axis })
    .toEqual({ me: b.me, opp: b.opp, lanes: b.lanes, events: b.events, teamColors: b.teamColors, axis: b.axis });
  expect(a.clockLabel(0.42)).toBe(b.clockLabel(0.42));
  expect(a.statusLabel(a.lanes[3].opp, 0.42)).toBe(b.statusLabel(b.lanes[3].opp, 0.42));
});
