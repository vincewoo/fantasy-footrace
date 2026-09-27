export const SPEEDS = [1, 2, 4, 8, 16] as const;

export interface Playback {
  t: number;
  liveT: number;
  speed: number;
  playing: boolean;
  scrubbing: boolean;
}

export function initPlayback(saved: unknown): Playback {
  const s = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>;
  const liveT = typeof s.liveT === 'number' ? s.liveT : 0.06;
  const t = typeof s.t === 'number' ? Math.min(s.t, liveT) : liveT;
  const speed = typeof s.speed === 'number' && s.speed ? s.speed : 1;
  return { t, liveT, speed, playing: liveT < 1, scrubbing: false };
}

export function advance(p: Playback, slateMinutes: number): Playback {
  if (!p.playing) return p;
  const dt = (0.1 * p.speed) / (slateMinutes * 60);
  const liveT = Math.min(1, p.liveT + dt);
  if (p.scrubbing) return { ...p, liveT };
  const wasLive = p.t >= p.liveT - 1e-9;
  const t = wasLive ? liveT : Math.min(liveT, p.t + dt);
  return { ...p, liveT, t, playing: !(liveT >= 1 && t >= 1) };
}

export function togglePlay(p: Playback): Playback {
  if (p.t >= 1 && p.liveT >= 1) return { ...p, t: 0, liveT: 0, playing: true };
  return { ...p, playing: !p.playing };
}

export function cycleSpeed(p: Playback): Playback {
  const i = (SPEEDS as readonly number[]).indexOf(p.speed);
  return { ...p, speed: SPEEDS[(i + 1) % SPEEDS.length] };
}

export function goLive(p: Playback): Playback {
  return { ...p, t: p.liveT, playing: p.liveT < 1 };
}

export function scrubTo(p: Playback, f: number): Playback {
  return { ...p, t: Math.min(p.liveT, Math.max(0, Math.min(1, f))) };
}
