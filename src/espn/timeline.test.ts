import { describe, expect, it } from 'vitest';
import { buildTimeline, GAME_MS, timeLabel } from './timeline';

const TZ = 'America/New_York';
const KICKOFFS = [1790295300000, 1790528400000, 1790539500000, 1790540700000, 1790554800000, 1790640900000];

describe('timeLabel', () => {
  it('uppercases the weekday and drops :00 when minutes are off', () => {
    expect(timeLabel(1790295300000, TZ, false)).toBe('THU 8:15 PM');
    expect(timeLabel(1790528400000, TZ, false)).toBe('SUN 1 PM');
    expect(timeLabel(1790539500000, TZ, false)).toBe('SUN 4:05 PM');
    expect(timeLabel(1790540700000, TZ, false)).toBe('SUN 4:25 PM');
    expect(timeLabel(1790554800000, TZ, false)).toBe('SUN 8:20 PM');
    expect(timeLabel(1790640900000, TZ, false)).toBe('MON 8:15 PM');
  });

  it('keeps minutes when they are asked for', () => {
    expect(timeLabel(1790528400000, TZ, true)).toBe('SUN 1:00 PM');
    expect(timeLabel(1790640900000, TZ, true)).toBe('MON 8:15 PM');
  });

  it('uses the timezone it is handed', () => {
    expect(timeLabel(1790528400000, 'America/Los_Angeles', true)).toBe('SUN 10:00 AM');
    expect(timeLabel(1790528400000, 'UTC', true)).toBe('SUN 5:00 PM');
  });

  it('emits plain spaces, never a narrow or non-breaking one', () => {
    expect(timeLabel(1790528400000, TZ, true)).not.toMatch(/[\u202f\u00a0]/);
  });
});

describe('buildTimeline', () => {
  const tl = buildTimeline(KICKOFFS, TZ);

  it('merges the 3.5 h windows and skips the dead hours', () => {
    expect(GAME_MS).toBe(12600000);
    expect(tl.startMs).toBe(1790295300000);
    expect(tl.endMs).toBe(1790653500000);
    expect(tl.totalMs).toBe(62700000);
  });

  it('sorts and dedups its kickoffs', () => {
    const shuffled = [...KICKOFFS].reverse().concat(KICKOFFS);
    expect(buildTimeline(shuffled, TZ).totalMs).toBe(62700000);
  });

  it('places the six kickoffs at their compressed t', () => {
    expect(tl.toT(1790295300000)).toBe(0);
    expect(tl.toT(1790528400000)).toBeCloseTo(0.200957, 6);
    expect(tl.toT(1790539500000)).toBeCloseTo(0.377990, 6);
    expect(tl.toT(1790540700000)).toBeCloseTo(0.397129, 6);
    expect(tl.toT(1790554800000)).toBeCloseTo(0.598086, 6);
    expect(tl.toT(1790640900000)).toBeCloseTo(0.799043, 6);
  });

  it('clamps outside the timeline', () => {
    expect(tl.toT(1790295300000 - 1)).toBe(0);
    expect(tl.toT(1790653500000 + 1)).toBe(1);
    expect(tl.toMs(0)).toBe(1790295300000);
    expect(tl.toMs(-1)).toBe(1790295300000);
    expect(tl.toMs(1)).toBe(1790653500000);
    expect(tl.toMs(2)).toBe(1790653500000);
  });

  it('sends gap time to the next window start instead of interpolating', () => {
    expect(tl.toT(1790307900000)).toBeCloseTo(0.200957, 6);
    expect(tl.toT(1790307900000 + 60 * 60 * 1000)).toBeCloseTo(0.200957, 6);
    expect(tl.toT(1790528400000 - 1)).toBeCloseTo(0.200957, 6);
  });

  it('round-trips inside a window and never goes backwards', () => {
    const sundayTwoPm = 1790528400000 + 60 * 60 * 1000;
    expect(Math.round(tl.toMs(tl.toT(sundayTwoPm)))).toBe(sundayTwoPm);

    let previous = -1;
    for (let ms = 1790295300000 - 6 * 60 * 60 * 1000; ms <= tl.endMs + 6 * 60 * 60 * 1000; ms += 15 * 60 * 1000) {
      const t = tl.toT(ms);
      expect(t).toBeGreaterThanOrEqual(previous);
      previous = t;
    }
  });

  it('clusters the kickoffs into the design axis', () => {
    expect(tl.axis.map(a => a.label)).toEqual([
      'THU 8:15 PM',
      'SUN 1 PM',
      'SUN 4:05 PM',
      'SUN 8:20 PM',
      'MON 8:15 PM',
      'END',
    ]);
    expect(tl.axis[0].t).toBe(0);
    expect(tl.axis[1].t).toBeCloseTo(0.200957, 6);
    expect(tl.axis[2].t).toBeCloseTo(0.377990, 6);
    expect(tl.axis[3].t).toBeCloseTo(0.598086, 6);
    expect(tl.axis[4].t).toBeCloseTo(0.799043, 6);
    expect(tl.axis[5]).toEqual({ label: 'END', t: 1 });
  });

  it('labels the clock from the timeline', () => {
    expect(tl.clockLabel(0)).toBe('THU 8:15 PM');
    expect(tl.clockLabel(0.200957)).toBe('SUN 1:00 PM');
    expect(tl.clockLabel(1)).toBe('MON 11:45 PM');
  });
});

describe('buildTimeline without kickoffs', () => {
  it('throws instead of building an empty timeline', () => {
    expect(() => buildTimeline([], TZ)).toThrow('no NFL kickoffs for this week');
  });
});

describe('buildTimeline gap boundaries', () => {
  const tl = buildTimeline(KICKOFFS, TZ);

  it('sends a gap t to the next window start, not the previous window end', () => {
    expect(tl.toMs(tl.toT(1790400000000))).toBe(1790528400000);
    expect(tl.clockLabel(tl.toT(1790400000000))).toBe('SUN 1:00 PM');
    expect(tl.toMs(tl.toT(1790307900000))).toBe(1790528400000);
  });

  it('keeps times inside a window and the clamps unchanged', () => {
    expect(tl.toMs(tl.toT(1790530000000))).toBe(1790530000000);
    expect(tl.toMs(1)).toBe(1790653500000);
    expect(tl.toMs(0)).toBe(1790295300000);
  });
});
