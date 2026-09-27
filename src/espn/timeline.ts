export const GAME_MS = 3.5 * 60 * 60 * 1000;

const CLUSTER_MS = 30 * 60 * 1000;

export interface Timeline {
  startMs: number;
  endMs: number;
  totalMs: number;
  toT(ms: number): number;
  toMs(t: number): number;
  axis: { label: string; t: number }[];
  clockLabel(t: number): string;
}

export function timeLabel(ms: number, timeZone: string, withMinutes: boolean): string {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  const label = format.format(new Date(ms)).replace(/\s/g, ' ').replace(/,/g, '');
  const upper = label.replace(/^[A-Za-z]+/, word => word.toUpperCase());
  return withMinutes ? upper : upper.replace(/:00 /, ' ');
}

function clusters(kickoffs: number[]): number[] {
  const starts: number[] = [];
  for (const k of kickoffs) {
    if (starts.length === 0 || k - starts[starts.length - 1] > CLUSTER_MS) starts.push(k);
  }
  return starts;
}

export function buildTimeline(kickoffsMs: number[], timeZone: string): Timeline {
  const kickoffs = [...new Set(kickoffsMs)].sort((a, b) => a - b);
  if (kickoffs.length === 0) throw new Error('no NFL kickoffs for this week');

  const windows: { start: number; end: number }[] = [];
  for (const k of kickoffs) {
    const last = windows[windows.length - 1];
    if (last && k <= last.end) last.end = Math.max(last.end, k + GAME_MS);
    else windows.push({ start: k, end: k + GAME_MS });
  }

  let totalMs = 0;
  const before: number[] = [];
  for (const w of windows) {
    before.push(totalMs);
    totalMs += w.end - w.start;
  }

  const startMs = windows[0].start;
  const endMs = windows[windows.length - 1].end;

  function toT(ms: number): number {
    if (ms <= startMs) return 0;
    for (let i = 0; i < windows.length; i += 1) {
      const w = windows[i];
      if (ms < w.start) return before[i] / totalMs;
      if (ms <= w.end) return (before[i] + ms - w.start) / totalMs;
    }
    return 1;
  }

  function toMs(t: number): number {
    if (t <= 0) return startMs;
    if (t >= 1) return endMs;
    const at = t * totalMs;
    for (let i = 0; i < windows.length; i += 1) {
      const w = windows[i];
      if (at < before[i] + w.end - w.start) return w.start + (at - before[i]);
    }
    return endMs;
  }

  const axis = clusters(kickoffs).map(k => ({ label: timeLabel(k, timeZone, false), t: toT(k) }));
  axis.push({ label: 'END', t: 1 });

  return {
    startMs,
    endMs,
    totalMs,
    toT,
    toMs,
    axis,
    clockLabel: t => timeLabel(toMs(t), timeZone, true),
  };
}
