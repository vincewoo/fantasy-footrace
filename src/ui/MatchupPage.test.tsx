import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { snapshotAt } from '../model/derive';
import { mockSlate } from '../sim/mock';
import { EspnError } from '../espn/client';
import { ConnectError, TeamPicker } from './Connect';
import { laneKey, MatchupPage } from './MatchupPage';

const HALF = mockSlate('Half PPR');
const TAUNTS = ['TOO EASY', 'SCOREBOARD!', 'LUCKY BOUNCE', 'BENCH HIM', 'WAIT TILL SNF', 'GG NO RE'];

it('renders the design\u2019s header, scoreboard and controls on the first frame', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);

  expect(m).toContain('Hail Mary Poppins');
  expect(m).toContain('The Kupp Runneth Over');
  expect(m).toContain('WEEK 4 · SUNDAY SLATE · BACKYARD LEAGUE');
  expect(m).toContain('>15.1<');
  expect(m).toContain('>9.1<');
  expect(m).toContain('PROJ 137.7');
  expect(m).toContain('PROJ 132.9');
  expect(m).toContain('YOU 59%');
  expect(m).toContain('41% DAVE');
  expect(m).toContain('1:38 PM');
  expect(m).toContain('>LIVE<');
  expect(m).toContain('19 PLAYS');
  expect(m).toContain('src="/logo.svg"');
  expect(m).toContain('SOUND: ON');
  expect(m).toContain('>x1<');
  expect(m).toContain('>PAUSE<');
});

it('renders the newest play at the top of the ticker', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);

  expect(m).toContain('Steelers D scoop up a loose ball');
  expect(m).toContain('1:37 PM · D/ST · DAVE');
  expect(m).toContain('>+2.0<');
});

it('renders the nine lane diffs in order', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);
  const diffs = [...m.matchAll(/font-size:10px;font-weight:700;color:[^"]*">([^<]*)</g)].map(match => match[1]);

  expect(diffs).toEqual(['+6.8', '+2.4', '\u22128.1', '+6.4', 'EVEN', 'EVEN', '+0.5', 'EVEN', '\u22122.0']);
});

it('renders the name card of a player who has scored', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);

  expect(m).toContain('BUF · Q1 3:25 · proj 22.4');
  expect(m).toContain('>6.8<');
});

it('renders the six taunt buttons and the transport controls', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);
  const buttons = [...m.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(match => match[1]);

  expect(buttons.filter(text => TAUNTS.includes(text))).toEqual(TAUNTS);
  expect(buttons).toHaveLength(10);
});

it('follows the slate through the pure snapshot', () => {
  expect(snapshotAt(HALF, 0.5).past).toHaveLength(102);
});

it('swaps in the live subtitle and keeps the design one by default', () => {
  const live = renderToStaticMarkup(<MatchupPage slate={HALF} subtitle="WEEK 3 · #FPANDFRIENDS" />);
  const demo = renderToStaticMarkup(<MatchupPage slate={HALF} />);

  expect(live).toContain('WEEK 3 · #FPANDFRIENDS');
  expect(live).not.toContain('BACKYARD LEAGUE');
  expect(demo).toContain('WEEK 4 · SUNDAY SLATE · BACKYARD LEAGUE');
});

it('offers every league team on the picker card', () => {
  const teams = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Team ${i + 1}`, owner: `owner${i + 1}` }));

  const m = renderToStaticMarkup(
    <TeamPicker teams={teams} leagueName="#fpandfriends" onPick={() => {}} onDemo={() => {}} />,
  );

  expect(m).toContain('Pick your team');
  expect(m).toContain('#fpandfriends');
  for (const team of teams) expect(m).toContain(team.name);
  expect(m).toContain('Just watch the demo');
});

it('tells the viewer how to fix a private league', () => {
  const m = renderToStaticMarkup(
    <ConnectError error={new EspnError('not visible', 401, 'private')} onRetry={() => {}} onDemo={() => {}} />,
  );

  expect(m).toContain('.env.local');
  expect(m).toContain('Retry');
  expect(m).toContain('Use demo');
});

it('shows the opponent\u2019s presence and the taunt box in a live room', () => {
  const m = renderToStaticMarkup(
    <MatchupPage
      slate={HALF}
      liveNow={() => 0.06}
      talk={{ connected: true, oppWatching: true, send: () => true }}
    />,
  );

  expect(m).toContain('DAVE IS WATCHING');
  expect(m).toContain('placeholder="SAY SOMETHING"');
  const box = /<input[^>]*placeholder="SAY SOMETHING"[^>]*>/.exec(m)?.[0] ?? '';
  expect(box).toMatch(/maxlength="24"/i);
  expect(box).not.toContain('disabled');
});

it('says talk is offline and disables the box without a room', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} liveNow={() => 0.06} talk={null} />);

  expect(m).toContain('TALK OFFLINE');
  const box = /<input[^>]*placeholder="SAY SOMETHING"[^>]*>/.exec(m)?.[0] ?? '';
  expect(box).toContain('disabled');
});

it('keeps the demo free of the talk box and the room status', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);

  expect(m).not.toContain('SAY SOMETHING');
  expect(m).not.toContain('TALK OFFLINE');
});

it('shows the real current time on the live clock instead of the timeline time', () => {
  const m = renderToStaticMarkup(
    <MatchupPage slate={HALF} liveNow={() => 0.06} liveClock={() => 'SUN 5:15 AM'} />,
  );

  expect(m).toContain('SUN 5:15 AM');
  expect(m).not.toContain('1:38 PM');
});

it('builds a lane key from the side and lane', () => {
  expect(laneKey('opp', 3)).toBe('opp3');
  expect(laneKey('me', 0)).toBe('me0');
});

it('animates and marks OUT for ESPN-style ids that never equal their lane key', () => {
  let n = 0;
  const live = {
    ...HALF,
    lanes: HALF.lanes.map(lane => ({
      slot: lane.slot,
      me: { ...lane.me, id: String(4000000 + n++) },
      opp: { ...lane.opp, id: String(4000000 + n++) },
    })),
    events: [{ id: 1, t: 0.01, side: 'opp' as const, lane: 2, kind: 'injury' as const, yds: 0, pts: 0, text: 'Henry ruled OUT' }],
  };

  const m = renderToStaticMarkup(<MatchupPage slate={live} />);
  const count = (needle: string) => m.split(needle).length - 1;

  expect(m).toContain('BAL · OUT');
  expect(count('right:-8px')).toBe(1);
  expect(count('grayscale(.85)')).toBe(1);
});

function stubStore(items: Record<string, string> = {}): Record<string, string> {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (k in items ? items[k] : null),
      setItem: (k: string, v: string) => {
        items[k] = v;
      },
    },
  });
  return items;
}

function clearStore(): void {
  Reflect.deleteProperty(globalThis, 'localStorage');
}

it('defaults sound to on with an empty store', async () => {
  const { readSoundPref } = await import('./MatchupPage');
  stubStore();

  expect(readSoundPref()).toBe(true);
  clearStore();
});

it('remembers a viewer who turned sound off', async () => {
  const { readSoundPref, saveSoundPref, SOUND_KEY } = await import('./MatchupPage');
  const store = stubStore();

  saveSoundPref(false);

  expect(store[SOUND_KEY]).toBe('off');
  expect(readSoundPref()).toBe(false);
  clearStore();
});

it('remembers a viewer who left sound on', async () => {
  const { readSoundPref, saveSoundPref, SOUND_KEY } = await import('./MatchupPage');
  const store = stubStore();

  saveSoundPref(true);

  expect(store[SOUND_KEY]).toBe('on');
  expect(readSoundPref()).toBe(true);
  clearStore();
});

it('defaults sound to on when localStorage throws', async () => {
  const { readSoundPref } = await import('./MatchupPage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
    },
  });

  expect(readSoundPref()).toBe(true);
  clearStore();
});

const CO_GM = { ...HALF, opp: { ...HALF.opp, owner: 'EMMA & EMILY' } };

it('uses a plural verb for co-GMs who are watching', () => {
  const m = renderToStaticMarkup(
    <MatchupPage
      slate={CO_GM}
      liveNow={() => 0.06}
      talk={{ connected: true, oppWatching: true, send: () => true }}
    />,
  );

  expect(m).toContain('EMMA &amp; EMILY ARE WATCHING');
  expect(m).not.toContain('EMMA &amp; EMILY IS WATCHING');
});

it('uses a plural verb for co-GMs who are away', () => {
  const m = renderToStaticMarkup(
    <MatchupPage
      slate={CO_GM}
      liveNow={() => 0.06}
      talk={{ connected: true, oppWatching: false, send: () => true }}
    />,
  );

  expect(m).toMatch(/EMMA &amp; EMILY AREN(&#x27;|')T HERE/);
  expect(m).not.toContain('EMMA &amp; EMILY ISN');
});

it('keeps a singular verb for a single owner', () => {
  const m = renderToStaticMarkup(
    <MatchupPage
      slate={HALF}
      liveNow={() => 0.06}
      talk={{ connected: true, oppWatching: false, send: () => true }}
    />,
  );

  expect(m).toMatch(/DAVE ISN(&#x27;|')T HERE/);
});

const WIDE_AXIS_ROW =
  '<div style="position:relative;height:11px;font-family:&#x27;Silkscreen&#x27;, monospace;font-size:9px;color:#5b5566;white-space:nowrap">'
  + '<div style="position:absolute;left:0">1 PM</div>'
  + '<div style="position:absolute;left:28.6%;transform:translateX(-50%)">4 PM</div>'
  + '<div style="position:absolute;left:69.8%;transform:translateX(-50%)">SNF</div>'
  + '<div style="position:absolute;right:0">END</div></div>';

it('replaces the axis labels with notches and one label that follows the handle on a phone', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} initialWidth={390} />);
  const count = (needle: string) => m.split(needle).length - 1;
  const now = /<div data-axis-now="true" style="([^"]*)">([^<]*)</.exec(m);

  expect(count('data-axis-notch')).toBe(3);
  expect(count('data-axis-now')).toBe(1);
  expect(now?.[2]).toBe('1:38 PM');
  expect(now?.[1]).toContain('top:7px');
  expect(now?.[1]).toContain('left:0');
  expect(m).not.toContain('translateX(-50%)">1:38');
  for (const label of ['>1 PM<', '>4 PM<', '>SNF<', '>END<']) expect(m).not.toContain(label);
});

it('keeps every kickoff label on a wide screen, byte-identical to the base markup', () => {
  const wide = renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} initialWidth={1200} />);
  const omitted = renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} />);

  for (const label of ['>1 PM<', '>4 PM<', '>SNF<', '>END<']) expect(wide).toContain(label);
  expect(wide).toContain(WIDE_AXIS_ROW);
  expect(omitted).toBe(wide);
  expect(wide).not.toContain('data-axis-');
});

it('follows the live clock with the single axis label on a phone', () => {
  const m = renderToStaticMarkup(
    <MatchupPage slate={mockSlate('Half PPR')} initialWidth={390} liveNow={() => 0.5} liveClock={() => 'SUN 5:15 AM'} />,
  );
  const now = /<div data-axis-now="true" style="([^"]*)">([^<]*)</.exec(m);

  expect(now?.[2]).toBe('SUN 5:15 AM');
});

