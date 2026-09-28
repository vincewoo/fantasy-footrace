const TALK_PATH = /^\/talk\/(\d{4})\/(\d{1,2})\/(\d{1,4})$/;
const TEAM = /^\d{1,2}$/;
const BASE64URL = /^[A-Za-z0-9_-]*$/;
const CONTROL = /\p{Cc}/gu;
const KEY_PREFIX = 'key.';
const PROTOCOL = 'gridiron-gang';
const MAX_TEXT = 24;
const FULL_CLOSE = 1013;

export interface TalkPath {
  season: number;
  week: number;
  matchupId: number;
  team: number;
}

export interface TalkSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(v: unknown): void;
  deserializeAttachment(): unknown;
}

export interface TalkState {
  getWebSockets(): TalkSocket[];
  acceptWebSocket(ws: TalkSocket): void;
}

declare global {
  interface ResponseInit {
    webSocket?: TalkSocket;
  }
}

declare class WebSocketPair {
  0: TalkSocket;
  1: TalkSocket;
}

export const TALK_RATE_MS = 1500;
export const ROOM_CAP = 8;

export function parseTalkPath(url: URL): TalkPath | null {
  const match = TALK_PATH.exec(url.pathname);
  if (match === null) return null;

  const team = url.searchParams.get('team');
  if (team === null || !TEAM.test(team)) return null;

  return {
    season: Number(match[1]),
    week: Number(match[2]),
    matchupId: Number(match[3]),
    team: Number(team),
  };
}

function decodeBase64Url(value: string): string | null {
  if (!BASE64URL.test(value) || value.length % 4 === 1) return null;

  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function keyFromProtocols(header: string | null): string | null {
  if (header === null) return null;

  const entries = header.split(',').map((entry) => entry.trim());
  if (!entries.includes(PROTOCOL)) return null;

  const key = entries.find((entry) => entry.startsWith(KEY_PREFIX));
  if (key === undefined) return null;

  return decodeBase64Url(key.slice(KEY_PREFIX.length));
}

export function cleanTaunt(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const { type, text } = raw as { type?: unknown; text?: unknown };
  if (type !== 'taunt' || typeof text !== 'string') return null;

  const cleaned = text.trim().replace(CONTROL, '');
  const length = [...cleaned].length;
  if (length < 1 || length > MAX_TEXT) return null;

  return cleaned;
}

interface Attachment {
  team: number;
  last: number;
}

function attachmentOf(socket: TalkSocket): Attachment | null {
  const value = socket.deserializeAttachment();
  if (typeof value !== 'object' || value === null) return null;

  const { team, last } = value as { team?: unknown; last?: unknown };
  if (typeof team !== 'number') return null;

  return { team, last: typeof last === 'number' ? last : 0 };
}

function presenceFrame(sockets: TalkSocket[]): string {
  const teams = sockets
    .map((socket) => attachmentOf(socket)?.team)
    .filter((team): team is number => team !== undefined);

  return JSON.stringify({ type: 'presence', teams: [...new Set(teams)].sort((a, b) => a - b) });
}

export class TalkRoom {
  private readonly state: TalkState;

  constructor(state: TalkState, _env: unknown) {
    this.state = state;
  }

  join(ws: TalkSocket, team: number, _now: number): void {
    if (this.state.getWebSockets().length >= ROOM_CAP) {
      ws.close(FULL_CLOSE, 'room full');
      return;
    }

    this.state.acceptWebSocket(ws);
    ws.serializeAttachment({ team, last: 0 });
    this.broadcastPresence();
  }

  webSocketMessage(ws: TalkSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    const text = cleanTaunt(parsed);
    if (text === null) return;

    const attachment = attachmentOf(ws);
    if (attachment === null) return;

    const at = Date.now();
    if (at - attachment.last < TALK_RATE_MS) return;

    ws.serializeAttachment({ team: attachment.team, last: at });

    const frame = JSON.stringify({ type: 'taunt', team: attachment.team, text, at });
    for (const socket of this.state.getWebSockets()) {
      if (socket !== ws) socket.send(frame);
    }
  }

  webSocketClose(ws: TalkSocket): void {
    this.broadcastPresence(ws);
  }

  webSocketError(ws: TalkSocket): void {
    this.broadcastPresence(ws);
  }

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const team = parseTalkPath(new URL(request.url))?.team ?? 0;

    this.join(pair[1], team, Date.now());

    return new Response(null, {
      status: 101,
      webSocket: pair[0],
      headers: { 'Sec-WebSocket-Protocol': PROTOCOL },
    });
  }

  private broadcastPresence(exclude?: TalkSocket): void {
    const sockets = this.state.getWebSockets().filter((socket) => socket !== exclude);
    const frame = presenceFrame(sockets);

    for (const socket of sockets) socket.send(frame);
  }
}
