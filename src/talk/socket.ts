import { cleanTaunt } from '../worker/talk';

const OPEN = 1;
const RECONNECT_MS = [1000, 2000, 4000, 8000, 16000, 30000];

export function talkUrl(
  base: string,
  p: { season: number; week: number; matchupId: number; team: number },
): string | null {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const scheme = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = url.pathname.replace(/\/+$/, '');
  return `${scheme}//${url.host}${path}/talk/${p.season}/${p.week}/${p.matchupId}?team=${p.team}`;
}

export function keyProtocol(key: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(key)) binary += String.fromCharCode(byte);
  return 'key.' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface TalkHandlers {
  onTaunt(team: number, text: string): void;
  onPresence(teams: number[]): void;
  onStatus(connected: boolean): void;
}

export interface TalkConnection {
  send(text: string): boolean;
  close(): void;
}

function handleFrame(data: unknown, handlers: TalkHandlers): void {
  if (typeof data !== 'string') return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return;
  }
  if (typeof parsed !== 'object' || parsed === null) return;

  const frame = parsed as { type?: unknown; team?: unknown; text?: unknown; teams?: unknown };
  if (frame.type === 'taunt') {
    if (typeof frame.team === 'number' && typeof frame.text === 'string') {
      handlers.onTaunt(frame.team, frame.text);
    }
    return;
  }
  if (
    frame.type === 'presence' &&
    Array.isArray(frame.teams) &&
    frame.teams.every(team => typeof team === 'number')
  ) {
    handlers.onPresence(frame.teams as number[]);
  }
}

export function connectTalk(
  url: string,
  key: string,
  handlers: TalkHandlers,
  opts: {
    WebSocketImpl?: typeof WebSocket;
    setTimeoutImpl?: typeof setTimeout;
    clearTimeoutImpl?: typeof clearTimeout;
  } = {},
): TalkConnection {
  const SocketImpl = opts.WebSocketImpl ?? WebSocket;
  const setTimer = opts.setTimeoutImpl ?? setTimeout;
  const clearTimer = opts.clearTimeoutImpl ?? clearTimeout;

  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let stopped = false;

  const scheduleReconnect = (): void => {
    if (stopped) return;
    if (timer !== null) clearTimer(timer);
    const delay = RECONNECT_MS[Math.min(attempts, RECONNECT_MS.length - 1)];
    attempts += 1;
    timer = setTimer(() => {
      timer = null;
      if (stopped) return;
      open();
    }, delay);
  };

  const open = (): void => {
    const next = new SocketImpl(url, ['gridiron-gang', keyProtocol(key)]);
    socket = next;
    next.onopen = () => {
      attempts = 0;
      handlers.onStatus(true);
    };
    next.onmessage = (event: MessageEvent) => handleFrame(event.data, handlers);
    next.onclose = () => {
      handlers.onStatus(false);
      scheduleReconnect();
    };
  };

  open();

  return {
    send(text: string): boolean {
      const cleaned = cleanTaunt({ type: 'taunt', text });
      const current = socket;
      if (cleaned === null || current === null || current.readyState !== OPEN) return false;
      current.send(JSON.stringify({ type: 'taunt', text: cleaned }));
      return true;
    },
    close(): void {
      stopped = true;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      socket?.close();
    },
  };
}
