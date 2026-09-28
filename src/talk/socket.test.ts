import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectTalk, keyProtocol, talkUrl, type TalkHandlers } from './socket';

const URL_TALK = 'wss://gridiron-gang-espn.x.workers.dev/talk/2026/3/16?team=1';
const TARGET = { season: 2026, week: 3, matchupId: 16, team: 1 };

class FakeSocket {
  static instances: FakeSocket[] = [];

  url: string;
  protocols: string[] | undefined;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string, protocols?: string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeSocket.instances.push(this);
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.drop();
  }
}

interface Recorded {
  handlers: TalkHandlers;
  taunts: [number, string][];
  presences: number[][];
  statuses: boolean[];
}

function record(): Recorded {
  const taunts: [number, string][] = [];
  const presences: number[][] = [];
  const statuses: boolean[] = [];
  return {
    taunts,
    presences,
    statuses,
    handlers: {
      onTaunt: (team, text) => taunts.push([team, text]),
      onPresence: teams => presences.push(teams),
      onStatus: connected => statuses.push(connected),
    },
  };
}

function fakeOpts(): { opts: Parameters<typeof connectTalk>[3]; delays: number[] } {
  const delays: number[] = [];
  const setTimeoutImpl = ((fn: () => void, ms?: number) => {
    delays.push(ms ?? 0);
    return globalThis.setTimeout(fn, ms);
  }) as unknown as typeof setTimeout;

  return {
    delays,
    opts: {
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
      setTimeoutImpl,
      clearTimeoutImpl: globalThis.clearTimeout as unknown as typeof clearTimeout,
    },
  };
}

describe('talkUrl', () => {
  it('builds the room url from an absolute base', () => {
    expect(talkUrl('https://gridiron-gang-espn.x.workers.dev', TARGET)).toBe(
      'wss://gridiron-gang-espn.x.workers.dev/talk/2026/3/16?team=1',
    );
  });

  it('drops a trailing slash and speaks ws for an http base', () => {
    expect(talkUrl('http://localhost:8787/', TARGET)).toBe(
      'ws://localhost:8787/talk/2026/3/16?team=1',
    );
  });

  it('returns null for a relative base', () => {
    expect(talkUrl('/espn', TARGET)).toBeNull();
  });
});

describe('keyProtocol', () => {
  it('encodes the passphrase as an unpadded base64url subprotocol', () => {
    expect(keyProtocol('hunter2')).toBe('key.aHVudGVyMg');
  });
});

describe('connectTalk', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the socket with the gridiron-gang protocols and reports the connection', () => {
    const { opts } = fakeOpts();
    const { handlers, statuses } = record();

    connectTalk(URL_TALK, 'hunter2', handlers, opts);

    const socket = FakeSocket.instances[0];
    expect(socket.url).toBe(URL_TALK);
    expect(socket.protocols).toEqual(['gridiron-gang', 'key.aHVudGVyMg']);

    socket.open();
    expect(statuses).toEqual([true]);
  });

  it('refuses to send before the socket is open', () => {
    const { opts } = fakeOpts();

    const connection = connectTalk(URL_TALK, 'hunter2', record().handlers, opts);

    expect(connection.send('GG')).toBe(false);
    expect(FakeSocket.instances[0].sent).toEqual([]);
  });

  it('cleans the text before sending and drops text over 24 characters', () => {
    const { opts } = fakeOpts();

    const connection = connectTalk(URL_TALK, 'hunter2', record().handlers, opts);
    const socket = FakeSocket.instances[0];
    socket.open();

    expect(connection.send('  GG ')).toBe(true);
    expect(socket.sent).toEqual(['{"type":"taunt","text":"GG"}']);

    expect(connection.send('x'.repeat(25))).toBe(false);
    expect(socket.sent).toHaveLength(1);
  });

  it('routes taunt and presence frames to the handlers', () => {
    const { opts } = fakeOpts();
    const { handlers, taunts, presences } = record();

    connectTalk(URL_TALK, 'hunter2', handlers, opts);
    const socket = FakeSocket.instances[0];

    socket.receive({ type: 'taunt', team: 10, text: 'COPE' });
    socket.receive({ type: 'presence', teams: [1, 10] });
    socket.receive({ type: 'taunt', team: '10', text: 'COPE' });
    socket.receive({ type: 'presence', teams: 'nope' });

    expect(taunts).toEqual([[10, 'COPE']]);
    expect(presences).toEqual([[1, 10]]);
  });

  it('reconnects with a growing backoff and resets it after an open', () => {
    const { opts, delays } = fakeOpts();
    const { handlers, statuses } = record();

    connectTalk(URL_TALK, 'hunter2', handlers, opts);
    FakeSocket.instances[0].drop();

    expect(statuses).toEqual([false]);
    expect(delays).toEqual([1000]);
    vi.advanceTimersByTime(999);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);

    FakeSocket.instances[1].drop();
    expect(delays).toEqual([1000, 2000]);
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.instances).toHaveLength(3);

    FakeSocket.instances[2].open();
    expect(statuses).toEqual([false, false, true]);
    FakeSocket.instances[2].drop();
    expect(delays).toEqual([1000, 2000, 1000]);
  });

  it('stops reconnecting after close', () => {
    const { opts, delays } = fakeOpts();

    const connection = connectTalk(URL_TALK, 'hunter2', record().handlers, opts);
    const socket = FakeSocket.instances[0];
    socket.open();
    socket.drop();
    expect(delays).toEqual([1000]);

    connection.close();
    vi.advanceTimersByTime(60000);

    expect(FakeSocket.instances).toHaveLength(1);
    expect(socket.readyState).toBe(3);
  });
});
