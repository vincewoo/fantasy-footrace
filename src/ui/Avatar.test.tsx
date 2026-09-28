import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { EventKind, Player, PlayEvent, TeamColors } from '../model/types';
import { Avatar, CelebrationFigure, celebrationOf, type AvatarProps } from './Avatar';

const BUF: TeamColors = { c1: '#00338D', c2: '#C60C30' };
const BAL: TeamColors = { c1: '#241773', c2: '#9E7C0C' };
const DEN: TeamColors = { c1: '#FB4F14', c2: '#002244' };

const WINDOW: [number, number] = [0.005, 0.29];

const ALLEN: Player = {
  id: 'me0', name: 'Josh Allen', last: 'Allen', pos: 'QB', team: 'BUF', num: 17,
  proj: 22.4, skin: 0, hair: 'short', hc: '#5a3a22', beard: 'full', window: WINDOW,
};

const HENRY: Player = {
  id: 'opp2', name: 'Derrick Henry', last: 'Henry', pos: 'RB', team: 'BAL', num: 22,
  proj: 15.8, skin: 4, hair: 'locs', hc: '#1d1411', beard: 'full', window: WINDOW,
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

it('paints a measured skin color over the palette tone', () => {
  const palette = render({ player: HENRY, colors: BAL });
  const measured = render({ player: { ...HENRY, sc: '#6a3c24' }, colors: BAL });

  expect(palette).toContain('fill="#5e3a22"');
  expect(measured).not.toContain('#5e3a22');
  expect(measured).toContain('fill="#6a3c24"');
});

it('draws the figure as one svg with pivoted limbs and the jersey number', () => {
  const m = render();

  expect(count(m, '<svg')).toBe(1);
  expect(m).toContain('transform-origin:8.6px 20px');
  expect(m).toContain('transform-origin:25.4px 20px');
  expect(m).toContain('transform-origin:13.4px 29px');
  expect(m).toContain('transform-origin:20.6px 29px');
  expect(m).toContain('>17</text>');
  expect(m).not.toContain('rgba(255,110,110');
});

it('draws every hair style and beard in the hair color', () => {
  const hairs: Player['hair'][] = ['bald', 'buzz', 'short', 'fade', 'curly', 'afro', 'locs', 'long', 'bun'];
  const beards: NonNullable<Player['beard']>[] = ['none', 'stubble', 'mustache', 'goatee', 'full'];
  for (const hair of hairs) {
    for (const beard of beards) {
      const m = render({ player: { ...ALLEN, hair, beard, hc: '#123456' } });
      const inHair = hair !== 'bald' && hair !== 'buzz' && hair !== 'fade';
      expect(m).toContain('<svg');
      if (inHair || beard === 'mustache' || beard === 'goatee' || beard === 'full') expect(m).toContain('fill="#123456"');
    }
  }
  expect(render({ player: { ...ALLEN, beard: 'none' } })).not.toContain('C3.6 2.2');
  expect(render({ player: { ...ALLEN, beard: 'full' } })).toContain('C3.6 2.2');
});

it('gives each head its own clip paths', () => {
  const both = renderToStaticMarkup(
    <>
      <CelebrationFigure player={ALLEN} colors={BUF} event={ev('recTD', 6)} size={1} />
      <CelebrationFigure player={ALLEN} colors={BUF} event={ev('recTD', 6)} size={1} />
    </>,
  );
  const ids = [...both.matchAll(/<clipPath id="([^"]+)"/g)].map(match => match[1]);

  expect(ids.length).toBe(8);
  expect(new Set(ids).size).toBe(8);
});

it('puts the defense in a team helmet with a facemask', () => {
  const m = render({ player: BRONCOS, colors: DEN, pts: 2, scale: 16.4 });

  expect(m).toContain('fill="#FB4F14"');
  expect(m).toContain('stroke="#002244"');
  expect(m).toContain('stroke="#a3aab1"');
});

it('wears a headband over the hair, but never over a helmet', () => {
  expect(render({ player: { ...ALLEN, band: '#e5583f' } })).toContain('fill="#e5583f"');
  expect(render({ player: { ...BRONCOS, band: '#e5583f' }, colors: DEN })).not.toContain('#e5583f');
});

it('renders the design\u2019s idle avatar', () => {
  const m = render();

  expect(divs(m)).toBe(4);
  expect(m).toContain('left:calc(18px + (100% - 36px) * 0.1116)');
  expect(m).toContain('>ALLEN 5.0<');
});

it('renders the design\u2019s touchdown pass', () => {
  const m = render({ event: ev('passTD', 4.4) });

  expect(divs(m)).toBe(19);
  expect(count(m, 'confetti 1s')).toBe(10);
  expect(count(m, '--dx:')).toBe(10);
  expect(count(m, '--dy:')).toBe(10);
  expect(m).toContain('>TD PASS!<');
});

it('renders the design\u2019s interception', () => {
  const m = render({ event: ev('int', -2) });

  expect(divs(m)).toBe(9);
  expect(m).toContain('>INT<');
});

it('renders the design\u2019s injured opponent', () => {
  const m = render({ player: HENRY, colors: BAL, side: 'opp', lane: 2, pts: 3, scale: 31.6, out: true });

  expect(divs(m)).toBe(5);
  expect(count(m, '>OUT<')).toBe(1);
  expect(m).toContain('>HENRY 3.0<');
  expect(m).toContain('left:calc(18px + (100% - 36px) * 0.0949)');
});

it('renders the design\u2019s napping player', () => {
  const m = render({ pts: 0, napping: true });

  expect(divs(m)).toBe(6);
  expect(count(m, 'zzz 2.4s')).toBe(3);
  expect(m).not.toContain('ALLEN');
});

it('renders the design\u2019s boosted player', () => {
  const m = render({ pts: 40 });

  expect(divs(m)).toBe(11);
  expect(count(m, 'flame .')).toBe(2);
  expect(count(m, 'speedline')).toBe(3);
  expect(m).toContain('left:calc(18px + (100% - 36px) * 0.8929)');
});

it('renders the design\u2019s defense tag', () => {
  const m = render({ player: BRONCOS, colors: DEN, pts: 2, scale: 16.4 });

  expect(divs(m)).toBe(4);
  expect(m).toContain('>DEN D 2.0<');
});

const evId = (kind: EventKind, pts: number, id: number): PlayEvent => ({ ...ev(kind, pts), id });

it('cycles the eight celebrations by event id', () => {
  expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => celebrationOf(evId('recTD', 6.2, n)))).toEqual([
    'griddy',
    'bird',
    'twerk',
    'spike',
    'luddy',
    'dunk',
    'heisman',
    'ickey',
    'griddy',
  ]);
});

it('keeps the lane touchdown catch on its pre play for id 1', () => {
  const m = render({ event: evId('recTD', 6.2, 1) });

  expect(m).toContain('av-catchtd-pre 1.9s steps(28)');
  expect(m).not.toContain('cel-');
  expect(m).not.toContain('arm-up-f-late');
  expect(m).not.toContain('arm-up-b-late');
  expect(m).not.toContain('av-catchtd 1.9s steps(28)');
});

it('runs every lane touchdown on its pre play with no celebration', () => {
  const PRE: Record<string, string> = { recTD: 'av-catchtd-pre', rushTD: 'av-td-pre', passTD: 'av-throwtd-pre' };

  for (const kind of ['recTD', 'rushTD', 'passTD'] as EventKind[]) {
    for (const n of [0, 1, 2, 3, 4]) {
      const m = render({ event: evId(kind, 6.2, n) });

      expect(m).toContain(PRE[kind] + ' 1.9s steps(28)');
      expect(m).not.toContain('cel-');
      expect(m).not.toContain('1.18s');
    }
  }

  const pass = render({ event: evId('passTD', 4.4, 2) });
  expect(pass).toContain('animation:arm-throw 1.4s steps(18)');
  expect(pass).toContain('>TD PASS!<');
});

function bannerFigure(n: number, kind: EventKind = 'recTD'): string {
  return renderToStaticMarkup(
    <CelebrationFigure player={ALLEN} colors={BUF} event={evId(kind, 6.2, n)} size={2} />,
  );
}

it('dances the Griddy in the banner figure', () => {
  const m = bannerFigure(0);

  expect(m).toContain('cel-griddy-leg-f 1.8s steps(18) infinite');
  expect(m).toContain('cel-griddy-leg-b 1.8s steps(18) infinite');
  expect(m).toContain('cel-griddy-body 1.8s steps(18) infinite');
});

it('dances the Dirty Bird in the banner figure', () => {
  const m = bannerFigure(1);

  expect(m).toContain('cel-bird-arm-f 1.8s steps(18) infinite');
  expect(m).toContain('cel-bird-arm-b 1.8s steps(18) infinite');
  expect(m).toContain('cel-bird-leg 1.8s steps(18) infinite');
  expect(m).toContain('cel-bird-body 1.8s steps(18) infinite');
});

it('hides the face on the banner Twerk', () => {
  const m = bannerFigure(2);

  expect(count(m, 'cel-face-away 1.8s steps(1) infinite')).toBe(1);
  expect(m).toContain('cel-twerk-body 1.8s steps(18) infinite');
  expect(m).toContain('cel-twerk-leg-f');
  expect(m).toContain('cel-twerk-leg-b');
});

it('shows the ball on the banner Spike', () => {
  const m = bannerFigure(3);

  expect(m).toContain('cel-spike-ball 1.8s steps(18) infinite');
  expect(m).toContain('cel-spike-arm 1.8s steps(18) infinite');
  expect(count(m, '#8a4b22')).toBe(1);
});

it('dances the Luddy in the banner figure', () => {
  const m = bannerFigure(4);

  expect(m).toContain('cel-luddy-body 1.8s steps(18) infinite');
  expect(m).toContain('cel-luddy-leg-f 1.8s steps(18) infinite');
  expect(m).toContain('cel-luddy-leg-b 1.8s steps(18) infinite');
  expect(m).toContain('cel-luddy-arm-f 1.8s steps(18) infinite');
  expect(m).not.toContain('#8a4b22');
});

it('dunks the ball over a goalpost only in the banner Dunk', () => {
  const m = bannerFigure(5);

  expect(m).toContain('cel-dunk-body 1.8s steps(18) infinite');
  expect(m).toContain('cel-dunk-ball 1.8s steps(18) infinite');
  expect(m).toContain('cel-dunk-post 1.8s steps(18) infinite');
  expect(m).toContain('stroke="#ffd23f"');
  expect(m).toContain('margin-right:28px');
  expect(count(m, '<svg')).toBe(2);
  expect(count(m, '#8a4b22')).toBe(1);

  for (const n of [0, 1, 2, 3, 4, 6, 7]) {
    const other = bannerFigure(n);
    expect(other).not.toContain('cel-dunk-post');
    expect(count(other, '<svg')).toBe(1);
    expect(other).toContain('margin-right:0');
  }
});

it('strikes the Heisman pose with the ball tucked', () => {
  const m = bannerFigure(6);

  expect(m).toContain('cel-heisman-arm-f 1.8s steps(18) infinite');
  expect(m).toContain('cel-heisman-leg 1.8s steps(18) infinite');
  expect(m).toContain('cel-heisman-ball 1.8s steps(18) infinite');
  expect(count(m, '#8a4b22')).toBe(1);
});

it('shuffles and spikes on the banner Ickey Shuffle', () => {
  const m = bannerFigure(7);

  expect(m).toContain('cel-ickey-body 1.8s steps(18) infinite');
  expect(m).toContain('cel-ickey-leg-f 1.8s steps(18) infinite');
  expect(m).toContain('cel-ickey-leg-b 1.8s steps(18) infinite');
  expect(m).toContain('cel-ickey-ball 1.8s steps(18) infinite');
  expect(count(m, '#8a4b22')).toBe(1);
});

it('loops every banner celebration immediately in a scaled box', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const m = bannerFigure(n);
    const anims = [...m.matchAll(/animation:([^;"]*cel-[^;"]*)/g)].map(match => match[1]);

    expect(anims.length).toBeGreaterThan(0);
    for (const anim of anims) {
      expect(anim).toContain('infinite');
      expect(anim).not.toContain('1.18s');
    }
  }

  const m = bannerFigure(1);
  expect(m).toContain('width:68px');
  expect(m).toContain('height:84px');
  expect(m).toContain('transform:scale(2)');
  expect(m).toContain('transform-origin:0 0');
  expect(m).toContain('>17<');
  expect(m).not.toContain('OUT');
});

it('flips the name tag left earlier in the compact layout', () => {
  const wide = render({ pts: 30 });
  const compact = render({ pts: 30, compact: true });

  expect(wide).toContain('left:32px');
  expect(compact).toContain('right:32px');
});
