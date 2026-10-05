import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { snapshotAt } from '../model/derive';
import { mockSlate } from '../sim/mock';
import { EspnError } from '../espn/client';
import { ConnectError } from './Connect';
import { laneKey, MatchupPage } from './MatchupPage';

const HALF = mockSlate('Half PPR');

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

it('renders the transport controls and no trash talk row', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);
  const buttons = [...m.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(match => match[1]);

  expect(buttons).toEqual(['SOUND: ON', 'PAUSE', 'x1', 'LIVE']);
  expect(m).not.toContain('TALK TRASH');
  expect(m).not.toContain('SAY SOMETHING');
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

it('tells the viewer how to fix a private league', () => {
  const m = renderToStaticMarkup(
    <ConnectError error={new EspnError('not visible', 401, 'private')} onRetry={() => {}} />,
  );

  expect(m).toContain('.env.local');
  expect(m).toContain('Retry');
  expect(m).not.toContain('demo');
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


it('swaps in the slim sticky scoreboard and latest-play strip on a phone', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} initialWidth={390} />);
  const latest = snapshotAt(HALF, 0.06).past.at(-1);

  expect(m).toContain('data-compact-scoreboard="true" style="position:sticky;top:8px');
  expect(m).toContain('LIVE · 1:38 PM');
  expect(m).toContain('>59%<');
  expect(m).toContain('>41%<');
  expect(m).toContain('>WIN %<');
  expect(m).not.toContain('Hail Mary Poppins');
  expect(m).not.toContain('WIN PROB');
  expect(m).toContain('data-latest-play');
  expect(m).toContain(`>${latest?.text}<`);
  expect(m).toContain('>SFX ON<');
  expect(m).toContain('display:none">WEEK 4');
});

it('puts a header above each lane and paints the names on the field on a phone', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} initialWidth={390} />);

  expect((m.match(/data-lane-header/g) ?? []).length).toBe(9);
  expect((m.match(/data-painted-name/g) ?? []).length).toBe(18);
  expect(m).toContain('>Allen<');
  expect(m).toContain('>Jackson<');
  expect(m).toContain('>DEN D<');
  expect(m).not.toContain('>Josh Allen<');
  expect(m).toContain('height:84px');
});

it('keeps the full scoreboard and name cards on a wide screen', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} initialWidth={1200} />);

  expect(m).toContain('Hail Mary Poppins');
  expect(m).toContain('>Josh Allen<');
  expect(m).toContain('height:96px');
  expect(m).toContain('display:block">WEEK 4');
  expect(m).not.toContain('data-compact-scoreboard');
  expect(m).not.toContain('data-latest-play');
  expect(m).not.toContain('data-lane-header');
  expect(m).not.toContain('data-painted-name');
});

it('keeps the subtitle on a compact screen wider than 520px', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} initialWidth={600} />);

  expect(m).toContain('data-compact-scoreboard');
  expect(m).toContain('display:block">WEEK 4');
});

it('seats the bench under the lanes, scoring only the benched players who have played', () => {
  const [qb, rb] = [HALF.lanes[0].me, HALF.lanes[1].opp];
  const slate = {
    ...HALF,
    bench: {
      me: [{ player: { ...qb, id: 'b1', last: 'Backup', window: [0, 0.1] as [number, number] }, pts: 7.25 }],
      opp: [
        { player: { ...rb, id: 'b2', last: 'Later', window: [0.95, 1] as [number, number] }, pts: 3 },
        { player: { ...rb, id: 'b3', last: 'Idle', window: [0, 0.1] as [number, number] } },
      ],
    },
  };
  const m = renderToStaticMarkup(<MatchupPage slate={slate} />);

  expect(m).toContain('The Bench');
  expect(m.indexOf('The Bench')).toBeGreaterThan(m.lastIndexOf('2× PROJ'));
  expect(m).toContain('data-bench-seat="b1"');
  expect(m).toContain('>BACKUP<');
  expect(m).toMatch(/data-bench-pts="true"[^>]*>7.3</);
  // a game that hasn't kicked off at the playhead shows no score yet, nor does a player without one
  expect(m).toContain('>LATER<');
  expect(m).toContain('>IDLE<');
  expect(m.match(/data-bench-pts/g)).toHaveLength(1);
  expect(m.indexOf('data-bench-side="me"')).toBeLessThan(m.indexOf('data-bench-side="opp"'));
});

it('stands up and waves the benched players outscoring a starter they could have replaced', () => {
  const [qb, rb] = [HALF.lanes[0].me, HALF.lanes[1].opp];
  const early: [number, number] = [0, 0.1];
  const slate = {
    ...HALF,
    // no plays yet, so every starter sits at zero
    events: [],
    bench: {
      me: [
        { player: { ...qb, id: 'b1', window: early }, pts: 4 },
        { player: { ...qb, id: 'b2', pos: 'DP' as const, window: early }, pts: 9 },
      ],
      opp: [{ player: { ...rb, id: 'b3', window: early }, pts: 0 }],
    },
  };
  const m = renderToStaticMarkup(<MatchupPage slate={slate} />);

  expect(m).toMatch(/data-bench-seat="b1" data-bench-waving="true"/);
  expect(m).toContain('arm-wave-f');
  expect(m).toContain('arm-wave-b');
  // no lane takes a defensive player, and a tie with an empty-handed starter isn't outscoring them
  expect(m.match(/data-bench-waving/g)).toHaveLength(1);
});

it('leaves the bench off a slate that has none', () => {
  expect(renderToStaticMarkup(<MatchupPage slate={HALF} />)).not.toContain('The Bench');
});

it('stacks the two benches on a phone, the viewer’s first', () => {
  const seat = { player: { ...HALF.lanes[0].me, id: 'b1' } };
  const slate = { ...HALF, bench: { me: [seat], opp: [{ player: { ...HALF.lanes[0].opp, id: 'b2' } }] } };
  const bench = (width: number) => {
    const m = renderToStaticMarkup(<MatchupPage slate={slate} initialWidth={width} />);
    return m.slice(m.indexOf('data-bench='));
  };

  expect(bench(393)).toMatch(/^[^>]*>.*?grid-template-columns:minmax\(0,1fr\);gap/);
  expect(bench(1200)).toMatch(/^[^>]*>.*?grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);gap/);
  expect(bench(393).indexOf('data-bench-side="me"')).toBeLessThan(bench(393).indexOf('data-bench-side="opp"'));
});
