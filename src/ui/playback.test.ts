import { expect, it } from 'vitest';
import { advance, cycleSpeed, goLive, initPlayback, scrubTo, SPEEDS, togglePlay, type Playback } from './playback';

const MINUTES = 4;
const dt = (speed: number) => (0.1 * speed) / (MINUTES * 60);
const DEFAULT = { t: 0.06, liveT: 0.06, speed: 1, playing: true, scrubbing: false };

it('starts live at the design\u2019s default when nothing is saved', () => {
  expect(SPEEDS).toEqual([1, 2, 4, 8, 16]);
  expect(initPlayback(undefined)).toEqual(DEFAULT);
});

it('caps a saved time at the saved live edge', () => {
  expect(initPlayback({ t: 0.5, liveT: 0.3, speed: 4 })).toEqual({ t: 0.3, liveT: 0.3, speed: 4, playing: true, scrubbing: false });
});

it('falls back to the defaults on malformed input', () => {
  expect(initPlayback(null)).toEqual(DEFAULT);
  expect(initPlayback('nope')).toEqual(DEFAULT);
  expect(initPlayback({ t: 'x', liveT: null, speed: {} })).toEqual(DEFAULT);
});

it('ticks the live edge and drags the playhead with it', () => {
  const p = advance({ ...DEFAULT }, MINUTES);

  expect(p.liveT).toBeCloseTo(0.06 + dt(1), 12);
  expect(p.t).toBeCloseTo(0.06 + dt(1), 12);
  expect(p.playing).toBe(true);
});

it('ticks the playhead on its own while replaying', () => {
  const p = advance({ t: 0.2, liveT: 0.5, speed: 16, playing: true, scrubbing: false }, MINUTES);

  expect(p.t).toBeCloseTo(0.2 + dt(16), 12);
  expect(p.liveT).toBeCloseTo(0.5 + dt(16), 12);
});

it('leaves a paused state untouched', () => {
  const paused: Playback = { t: 0.2, liveT: 0.5, speed: 4, playing: false, scrubbing: false };

  expect(advance(paused, MINUTES)).toEqual(paused);
});

it('moves only the live edge while scrubbing', () => {
  const p = advance({ t: 0.2, liveT: 0.5, speed: 2, playing: true, scrubbing: true }, MINUTES);

  expect(p.t).toBe(0.2);
  expect(p.liveT).toBeCloseTo(0.5 + dt(2), 12);
  expect(p.scrubbing).toBe(true);
});

it('stops at the end and restarts from the top', () => {
  const end: Playback = { t: 1, liveT: 1, speed: 1, playing: true, scrubbing: false };

  expect(advance(end, MINUTES).playing).toBe(false);
  expect(togglePlay(end)).toEqual({ t: 0, liveT: 0, speed: 1, playing: true, scrubbing: false });
  expect(togglePlay({ ...DEFAULT, playing: true }).playing).toBe(false);
});

it('cycles the speed ladder and wraps 16 back to 1', () => {
  expect(SPEEDS.map(speed => cycleSpeed({ ...DEFAULT, speed }).speed)).toEqual([2, 4, 8, 16, 1]);
});

it('goes live and scrubs without passing the live edge', () => {
  const back: Playback = { t: 0.2, liveT: 0.5, speed: 1, playing: false, scrubbing: false };

  expect(goLive(back)).toEqual({ t: 0.5, liveT: 0.5, speed: 1, playing: true, scrubbing: false });
  expect(goLive({ ...back, liveT: 1 }).playing).toBe(false);
  expect(scrubTo(back, 0.9).t).toBe(0.5);
  expect(scrubTo(back, 0.25).t).toBe(0.25);
  expect(scrubTo(back, -1).t).toBe(0);
});
