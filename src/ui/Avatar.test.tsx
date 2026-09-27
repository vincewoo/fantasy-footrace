import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { EventKind, Player, PlayEvent, TeamColors } from '../model/types';
import { Avatar, celebrationOf, type AvatarProps } from './Avatar';

const BUF: TeamColors = { c1: '#00338D', c2: '#C60C30' };
const BAL: TeamColors = { c1: '#241773', c2: '#9E7C0C' };
const DEN: TeamColors = { c1: '#FB4F14', c2: '#002244' };

const WINDOW: [number, number] = [0.005, 0.29];

const ALLEN: Player = {
  id: 'me0', name: 'Josh Allen', last: 'Allen', pos: 'QB', team: 'BUF', num: 17,
  proj: 22.4, skin: 0, hair: 'short', hc: '#5a3a22', beard: true, window: WINDOW,
};

const HENRY: Player = {
  id: 'opp2', name: 'Derrick Henry', last: 'Henry', pos: 'RB', team: 'BAL', num: 22,
  proj: 15.8, skin: 4, hair: 'locs', hc: '#1d1411', beard: true, window: WINDOW,
};

const BRONCOS: Player = {
  id: 'me8', name: 'Broncos D/ST', last: 'Broncos D', tag: 'DEN D', pos: 'DST', team: 'DEN',
  num: 'D', proj: 8.2, skin: 2, hair: 'helmet', window: WINDOW,
};

function render(over: Partial<AvatarProps> = {}): string {
  return renderToStaticMarkup(
    <Avatar
      player={ALLEN}
      colors={BUF}
      side="me"
      lane={0}
      pts={5}
      event={null}
      out={false}
      scrubbing={false}
      showTag
      scale={44.8}
      napping={false}
      offset={0}
      {...over}
    />,
  );
}

function ev(kind: EventKind, pts: number): PlayEvent {
  return { id: 1, kind, yds: 10, pts, t: 0.1, side: 'me', lane: 0, text: '' };
}

const divs = (m: string) => (m.match(/<div/g) ?? []).length;
const count = (m: string, needle: string) => m.split(needle).length - 1;

it('renders the design\u2019s idle avatar', () => {
  const m = render();

  expect(divs(m)).toBe(19);
  expect(m).toContain('left:11.160714285714286%');
  expect(m).toContain('>ALLEN 5.0<');
});

it('renders the design\u2019s touchdown pass', () => {
  const m = render({ event: ev('passTD', 4.4) });

  expect(divs(m)).toBe(34);
  expect(count(m, 'confetti 1s')).toBe(10);
  expect(count(m, '--dx:')).toBe(10);
  expect(count(m, '--dy:')).toBe(10);
  expect(m).toContain('>TD PASS!<');
});

it('renders the design\u2019s interception', () => {
  const m = render({ event: ev('int', -2) });

  expect(divs(m)).toBe(24);
  expect(m).toContain('>INT<');
});

it('renders the design\u2019s injured opponent', () => {
  const m = render({ player: HENRY, colors: BAL, side: 'opp', lane: 2, pts: 3, scale: 31.6, out: true });

  expect(divs(m)).toBe(23);
  expect(count(m, '>OUT<')).toBe(1);
  expect(m).toContain('>HENRY 3.0<');
  expect(m).toContain('left:9.493670886075948%');
});

it('renders the design\u2019s napping player', () => {
  const m = render({ pts: 0, napping: true });

  expect(divs(m)).toBe(21);
  expect(count(m, 'zzz 2.4s')).toBe(3);
  expect(m).not.toContain('ALLEN');
});

it('renders the design\u2019s boosted player', () => {
  const m = render({ pts: 40 });

  expect(divs(m)).toBe(26);
  expect(count(m, 'flame .')).toBe(2);
  expect(count(m, 'speedline')).toBe(3);
  expect(m).toContain('left:89.28571428571429%');
});

it('renders the design\u2019s defense tag', () => {
  const m = render({ player: BRONCOS, colors: DEN, pts: 2, scale: 16.4 });

  expect(divs(m)).toBe(20);
  expect(m).toContain('>DEN D 2.0<');
});

const evId = (kind: EventKind, pts: number, id: number): PlayEvent => ({ ...ev(kind, pts), id });

it('cycles the five celebrations by event id', () => {
  expect([0, 1, 2, 3, 4].map(n => celebrationOf(evId('recTD', 6.2, n)))).toEqual([
    'griddy',
    'spin',
    'bird',
    'twerk',
    'spike',
  ]);
});

it('keeps the touchdown catch on today\u2019s spin for id 1', () => {
  const m = render({ event: evId('recTD', 6.2, 1) });

  expect(m).toContain('av-catchtd 1.9s steps(28)');
  expect(m).toContain('arm-up-f-late 1.9s steps(24)');
  expect(m).toContain('arm-up-b-late 1.9s steps(24)');
  expect(m).not.toContain('cel-');
  expect(m).not.toContain('-pre');
});

it('renders the Dirty Bird catch', () => {
  const m = render({ event: evId('recTD', 6.2, 2) });

  expect(m).toContain('av-catchtd-pre 1.9s steps(28)');
  expect(m).toContain('cel-bird-arm-f 1.8s steps(18) 1.18s forwards');
  expect(m).toContain('cel-bird-arm-b 1.8s steps(18) 1.18s forwards');
  expect(m).toContain('cel-bird-leg 1.8s steps(18) 1.18s forwards');
  expect(m).toContain('cel-bird-body 1.8s steps(18) 1.18s forwards');
  expect(m).not.toContain('av-catchtd 1.9s');
});

it('renders the Twerk catch from behind', () => {
  const m = render({ event: evId('recTD', 6.2, 3) });

  expect(count(m, 'cel-face-away 1.8s steps(1) 1.18s forwards')).toBe(4);
  expect(m).toContain('cel-twerk-body 1.8s steps(18) 1.18s forwards');
  expect(m).toContain('cel-twerk-leg-f');
  expect(m).toContain('cel-twerk-leg-b');
});

it('renders the Griddy catch', () => {
  const m = render({ event: evId('recTD', 6.2, 0) });

  expect(m).toContain('cel-griddy-leg-f 1.8s steps(18) 1.18s forwards');
  expect(m).toContain('cel-griddy-leg-b 1.8s steps(18) 1.18s forwards');
  expect(m).toContain('cel-griddy-body 1.8s steps(18) 1.18s forwards');
});

it('renders the Spike catch with a ball', () => {
  const m = render({ event: evId('recTD', 6.2, 4) });

  expect(m).toContain('cel-spike-ball 1.8s steps(18) 1.18s forwards');
  expect(m).toContain('cel-spike-arm 1.8s steps(18) 1.18s forwards');
  expect(count(m, '#8a4b22')).toBe(2);
});

it('appends the celebration after the throw on a spiked touchdown pass', () => {
  const m = render({ event: evId('passTD', 4.4, 2) });

  expect(m).toContain('animation:arm-throw 1.4s steps(18), cel-bird-arm-f 1.8s steps(18) 1.18s forwards');
  expect(m).toContain('av-throwtd-pre 1.9s steps(28)');
  expect(m).not.toContain('arm-up-f-late');
});

it('runs every celebration on the 1.18s forwards beat', () => {
  for (const n of [0, 2, 3, 4]) {
    const m = render({ event: evId('rushTD', 6.0, n) });
    const anims = [...m.matchAll(/animation:([^;"]*cel-[^;"]*)/g)].map(match => match[1]);

    expect(anims.length).toBeGreaterThan(0);
    for (const anim of anims) expect(anim).toContain('1.18s forwards');
  }
});
