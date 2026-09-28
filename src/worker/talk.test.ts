import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTaunt,
  keyFromProtocols,
  parseTalkPath,
  ROOM_CAP,
  TalkRoom,
  TALK_RATE_MS,
  type TalkSocket,
  type TalkState,
} from './talk';

const BASE = 'https://w.example';

class FakeSocket implements TalkSocket {
  readonly sent: string[] = [];
  readonly closes: { code?: number; reason?: string }[] = [];
  attachment: unknown = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closes.push({ code, reason });
  }

  serializeAttachment(value: unknown): void {
    this.attachment = value;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

class FakeState implements TalkState {
  readonly sockets: FakeSocket[] = [];

  getWebSockets(): TalkSocket[] {
    return this.sockets;
  }

  acceptWebSocket(ws: TalkSocket): void {
    this.sockets.push(ws as FakeSocket);
  }
}

function makeRoom(): { state: FakeState; room: TalkRoom } {
  const state = new FakeState();
  return { state, room: new TalkRoom(state, {}) };
}

function last(socket: FakeSocket): unknown {
  return JSON.parse(socket.sent[socket.sent.length - 1]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseTalkPath', () => {
  it('reads the season, week, matchup and team', () => {
    expect(parseTalkPath(new URL(`${BASE}/talk/2026/3/14?team=1`))).toEqual({
      season: 2026,
      week: 3,
      matchupId: 14,
      team: 1,
    });
  });

  it('is null without a team or with a path outside the shape', () => {
    expect(parseTalkPath(new URL(`${BASE}/talk/2026/3/14`))).toBeNull();
    expect(parseTalkPath(new URL(`${BASE}/talk/2026/3/14?team=abc`))).toBeNull();
    expect(parseTalkPath(new URL(`${BASE}/talk/26/3/14?team=1`))).toBeNull();
    expect(parseTalkPath(new URL(`${BASE}/talk/2026/3/14/x?team=1`))).toBeNull();
  });
});

describe('keyFromProtocols', () => {
  it('decodes the key that follows the gridiron-gang marker', () => {
    expect(keyFromProtocols('gridiron-gang, key.aHVudGVyMg')).toBe('hunter2');
  });

  it('is null when gridiron-gang or the key entry is missing', () => {
    expect(keyFromProtocols('key.aHVudGVyMg')).toBeNull();
    expect(keyFromProtocols('gridiron-gang')).toBeNull();
  });
});

describe('cleanTaunt', () => {
  it('trims a taunt frame', () => {
    expect(cleanTaunt({ type: 'taunt', text: '  TOO EASY ' })).toBe('TOO EASY');
  });

  it('keeps 24 code points and drops 25', () => {
    expect(cleanTaunt({ type: 'taunt', text: 'a'.repeat(24) })).toBe('a'.repeat(24));
    expect(cleanTaunt({ type: 'taunt', text: 'a'.repeat(25) })).toBeNull();
    expect(cleanTaunt({ type: 'taunt', text: '😀'.repeat(24) })).toBe('😀'.repeat(24));
  });

  it('strips control characters', () => {
    expect(cleanTaunt({ type: 'taunt', text: 'a\u0000b' })).toBe('ab');
  });

  it('drops empty text and frames that are not taunts', () => {
    expect(cleanTaunt({ type: 'taunt', text: '' })).toBeNull();
    expect(cleanTaunt({ type: 'taunt', text: '   ' })).toBeNull();
    expect(cleanTaunt({ type: 'x', text: 'hi' })).toBeNull();
    expect(cleanTaunt('hi')).toBeNull();
  });
});

describe('TalkRoom', () => {
  it('broadcasts presence to every socket on join', () => {
    const { room } = makeRoom();
    const one = new FakeSocket();
    const ten = new FakeSocket();

    room.join(one, 1, 0);
    expect(last(one)).toEqual({ type: 'presence', teams: [1] });

    room.join(ten, 10, 0);
    expect(last(one)).toEqual({ type: 'presence', teams: [1, 10] });
    expect(last(ten)).toEqual({ type: 'presence', teams: [1, 10] });
  });

  it('relays a taunt to the others only, at most once per 1500 ms', () => {
    const { room } = makeRoom();
    const one = new FakeSocket();
    const ten = new FakeSocket();
    room.join(one, 1, 0);
    room.join(ten, 10, 0);

    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    room.webSocketMessage(one, JSON.stringify({ type: 'taunt', text: ' TOO EASY ' }));

    expect(last(ten)).toEqual({ type: 'taunt', team: 1, text: 'TOO EASY', at: 1_700_000_000_000 });
    expect(one.sent.filter((frame) => frame.includes('"taunt"'))).toHaveLength(0);

    now.mockReturnValue(1_700_000_000_000 + TALK_RATE_MS - 1);
    room.webSocketMessage(one, JSON.stringify({ type: 'taunt', text: 'NO WAY' }));
    expect(last(ten)).toEqual({ type: 'taunt', team: 1, text: 'TOO EASY', at: 1_700_000_000_000 });

    now.mockReturnValue(1_700_000_000_000 + TALK_RATE_MS);
    room.webSocketMessage(one, JSON.stringify({ type: 'taunt', text: 'NO WAY' }));
    expect(last(ten)).toEqual({
      type: 'taunt',
      team: 1,
      text: 'NO WAY',
      at: 1_700_000_000_000 + TALK_RATE_MS,
    });
  });

  it('ignores invalid JSON and binary frames without throwing', () => {
    const { room } = makeRoom();
    const one = new FakeSocket();
    const ten = new FakeSocket();
    room.join(one, 1, 0);
    room.join(ten, 10, 0);

    const before = ten.sent.length;
    expect(() => room.webSocketMessage(one, '{oops')).not.toThrow();
    expect(() => room.webSocketMessage(one, new ArrayBuffer(2))).not.toThrow();
    expect(ten.sent).toHaveLength(before);
  });

  it('broadcasts presence without the socket that closed', () => {
    const { room } = makeRoom();
    const one = new FakeSocket();
    const ten = new FakeSocket();
    room.join(one, 1, 0);
    room.join(ten, 10, 0);

    room.webSocketClose(ten);

    expect(last(one)).toEqual({ type: 'presence', teams: [1] });
  });

  it('closes a ninth socket with 1013', () => {
    const { state, room } = makeRoom();
    for (let team = 1; team <= ROOM_CAP; team++) room.join(new FakeSocket(), team, 0);

    const ninth = new FakeSocket();
    room.join(ninth, 9, 0);

    expect(ninth.closes).toEqual([{ code: 1013, reason: 'room full' }]);
    expect(ninth.sent).toHaveLength(0);
    expect(state.getWebSockets()).toHaveLength(ROOM_CAP);
  });
});
