import type { CSSProperties } from 'react';
import { fmt, sgn } from '../model/derive';
import type { EventKind, PlayEvent, Player, Side, TeamColors } from '../model/types';

export const ANIM: Record<EventKind, string> = {
  pass: 'throw',
  passTD: 'throwTD',
  int: 'int',
  rush: 'run',
  rushTD: 'td',
  catch: 'catch',
  recTD: 'catchTD',
  fumble: 'fumble',
  fg: 'kick',
  xp: 'kick',
  sack: 'sack',
  dint: 'takeaway',
  fumrec: 'takeaway',
  dtd: 'td',
  injury: 'hurt',
};

export type Celebration = 'bird' | 'twerk' | 'griddy' | 'spike';

export const CELEBRATIONS: readonly Celebration[] = ['griddy', 'bird', 'twerk', 'spike'];

export function celebrationOf(ev: PlayEvent): Celebration {
  return CELEBRATIONS[ev.id % CELEBRATIONS.length];
}

const INK = '#1c1a22';
const CREAM = '#fffaf0';
const SK = ['#f3cfae', '#dfa97f', '#b67b52', '#8a5634', '#5e3a22'];

export interface AvatarProps {
  player: Player;
  colors: TeamColors;
  side: Side;
  lane: number;
  pts: number;
  event: PlayEvent | null;
  out: boolean;
  scrubbing: boolean;
  showTag: boolean;
  scale: number;
  napping: boolean;
  offset: number;
  compact?: boolean;
}

// Players stand inside an 18px inset so a sprite at 0 or 2x projection stays on the field.
export function trackLeft(f: number): string {
  return `calc(18px + (100% - 36px) * ${f.toFixed(4)})`;
}

function hair(p: Player, T: TeamColors): { back: JSX.Element[]; front: JSX.Element[] } {
  const B = '2px solid ' + INK;
  const hc = p.hc;
  const back: JSX.Element[] = [];
  const front: JSX.Element[] = [];
  const cap = (hh: number, rad: string) => (
    <div
      key="cap"
      style={{ position: 'absolute', left: -2, right: -2, top: -3, height: hh, background: hc, border: B, borderBottom: 'none', borderRadius: rad }}
    />
  );
  switch (p.hair) {
    case 'short':
      front.push(cap(12, '15px 15px 4px 4px'));
      break;
    case 'fade':
      front.push(cap(9, '15px 15px 2px 2px'));
      break;
    case 'buzz':
      front.push(
        <div key="bz" style={{ position: 'absolute', left: 2, right: 2, top: 0, height: 7, background: hc, borderRadius: '12px 12px 2px 2px', opacity: 0.85 }} />,
      );
      break;
    case 'curly':
      [-4, 4, 12, 19].forEach((x, j) => front.push(
        <div key={'c' + j} style={{ position: 'absolute', left: x, top: -7 + (j % 2), width: 13, height: 12, borderRadius: '50%', background: hc, border: B }} />,
      ));
      break;
    case 'locs':
      [[-5, 4, 18], [-1, 8, 16], [24, 6, 12]].forEach(([x, y, hh], j) => back.push(
        <div key={'lc' + j} style={{ position: 'absolute', left: x, top: y, width: 6, height: hh, background: hc, border: B, borderRadius: 3 }} />,
      ));
      front.push(cap(10, '15px 15px 3px 3px'));
      break;
    case 'helmet':
      front.push(
        <div key="hm" style={{ position: 'absolute', left: -3, right: -3, top: -4, height: 17, background: T.c1, border: B, borderRadius: '16px 16px 5px 5px', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: '42%', width: 4, top: 0, bottom: 0, background: T.c2 }} />
        </div>,
      );
      front.push(
        <div key="fm" style={{ position: 'absolute', right: -6, top: 10, width: 10, height: 13, border: '2px solid #8f969c', borderLeft: 'none', borderRadius: '0 7px 7px 0' }} />,
      );
      break;
  }
  return { back, front };
}

const CELLS: Record<Celebration, { body: string | null; armF: string | null; armB: string | null; legF: string | null; legB: string | null; face: boolean; ball: boolean }> = {
  bird: { body: 'cel-bird-body', armF: 'cel-bird-arm-f', armB: 'cel-bird-arm-b', legF: 'cel-bird-leg', legB: null, face: false, ball: false },
  twerk: { body: 'cel-twerk-body', armF: 'cel-twerk-arm-f', armB: 'cel-twerk-arm-b', legF: 'cel-twerk-leg-f', legB: 'cel-twerk-leg-b', face: true, ball: false },
  griddy: { body: 'cel-griddy-body', armF: 'cel-griddy-arm-f', armB: 'cel-griddy-arm-b', legF: 'cel-griddy-leg-f', legB: 'cel-griddy-leg-b', face: false, ball: false },
  spike: { body: null, armF: 'cel-spike-arm', armB: null, legF: null, legB: null, face: false, ball: true },
};

function figure(
  p: Player,
  T: TeamColors,
  a: string | null,
  ev: PlayEvent | null,
  isOut: boolean,
  i: number,
  nap: boolean,
  boost: boolean,
  cel: Celebration | null = null,
): JSX.Element {
  const B = '2px solid ' + INK;
  const skin = SK[p.skin];
  if (nap) a = null;
  if (nap || isOut) boost = false;
  const TD = a === 'td' || a === 'catchTD' || a === 'throwTD';
  const PRE: Record<string, string> = {
    catchTD: 'av-catchtd-pre 1.9s steps(28)',
    td: 'av-td-pre 1.9s steps(28)',
    throwTD: 'av-throwtd-pre 1.9s steps(28)',
  };
  const C = cel ? CELLS[cel] : null;
  const BANNER = cel !== null;
  const CEL18 = (name: string) => name + ' 1.8s steps(18) infinite';
  const withCel = (base: string, name: string | null): string => (name ? (base === 'none' ? CEL18(name) : base + ', ' + CEL18(name)) : base);
  const BODY: Record<string, string> = {
    catch: 'av-jump 1.6s steps(24)',
    catchTD: 'av-catchtd 1.9s steps(28)',
    td: 'av-td 1.9s steps(28)',
    run: 'av-bob 1.5s steps(20)',
    throw: 'av-throw 1.4s steps(18)',
    throwTD: 'av-throwtd 1.9s steps(28)',
    int: 'av-shake 1.2s steps(18)',
    fumble: 'av-stumble 1.4s steps(18)',
    kick: 'av-kick 1.4s steps(18)',
    sack: 'av-lunge 1.2s steps(16)',
    takeaway: 'av-jump 1.6s steps(24)',
    hurt: 'av-hurt 1.4s steps(18) forwards',
  };
  const bodyAnim = BANNER
    ? (C!.body ? CEL18(C!.body) : 'none')
    : TD
      ? PRE[a as string]
      : nap
        ? `breathe 2.4s steps(6) ${-(i * 0.3).toFixed(2)}s infinite`
        : a ? BODY[a]
          : boost ? `hover 1s steps(6) ${-(i * 0.2).toFixed(2)}s infinite`
            : isOut ? 'none' : `av-idle 1.1s steps(2) ${-(i * 0.17).toFixed(2)}s infinite`;
  const run = !BANNER && a && !['kick', 'hurt', 'throw', 'sack'].includes(a);
  const legAnim = (d: number, name: string | null) => withCel(run ? `leg .16s steps(2) ${(0.4 + d).toFixed(2)}s 7 alternate` : 'none', name);
  const leg = (left: number, anim: string, key: string) => (
    <div
      key={key}
      style={{ position: 'absolute', left, bottom: 3, width: 7, height: 10, background: T.c2, border: B, borderRadius: '2px 2px 3px 3px', transformOrigin: '50% 0', animation: anim }}
    />
  );
  const armFbase = BANNER ? 'none'
    : (a === 'throw' || a === 'throwTD' || a === 'int') ? 'arm-throw 1.4s steps(18)'
      : (a === 'catch' || a === 'takeaway') ? 'arm-up-f 1.6s steps(20)' : 'none';
  const armBbase = BANNER ? 'none'
    : (a === 'catch' || a === 'takeaway') ? 'arm-up-b 1.6s steps(20)' : 'none';
  const armF = withCel(armFbase, C ? C.armF : null);
  const armB = withCel(armBbase, C ? C.armB : null);
  const arm = (left: number, anim: string, key: string) => (
    <div
      key={key}
      style={{ position: 'absolute', left, bottom: 13, width: 6, height: 12, background: skin, border: B, borderRadius: 3, transformOrigin: '50% 2px', animation: anim, overflow: 'hidden' }}
    >
      <div style={{ height: 4, background: T.c1 }} />
    </div>
  );
  const mood = BANNER ? 'happy'
    : (a === 'int' || a === 'fumble' || a === 'hurt' || (isOut && !a)) ? 'sad'
      : (TD || a === 'catch' || a === 'takeaway' || a === 'sack') ? 'happy' : 'norm';
  const mc = p.beard ? CREAM : INK;
  const mouth: CSSProperties = mood === 'sad'
    ? { top: 18, left: 15, width: 7, height: 4, borderTop: '2px solid ' + mc, borderRadius: '5px 5px 0 0' }
    : mood === 'happy'
      ? { top: 16, left: 14, width: 8, height: 5, background: mc, borderRadius: '0 0 5px 5px' }
      : { top: 17, left: 15, width: 6, height: 2, background: mc, borderRadius: 1 };
  const hr = hair(p, T);
  const eyeH = nap ? 2 : mood === 'happy' ? 3 : 5;
  if (nap) Object.assign(mouth, { top: 17, left: 16, width: 4, height: 4, background: mc, borderTop: 'none', borderRadius: '50%' });
  const faceAnim = C && C.face ? 'cel-face-away 1.8s steps(1) infinite' : undefined;
  const head = (
    <div key="hw" style={{ position: 'absolute', left: 3, bottom: 24, width: 28, height: 25 }}>
      {hr.back}
      <div key="hd" style={{ position: 'absolute', inset: 0, background: skin, border: B, borderRadius: '50%', overflow: 'hidden' }}>
        {p.beard ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: p.hc }} /> : null}
        <div style={{ position: 'absolute', left: 19, top: 15, width: 5, height: 3, borderRadius: '50%', background: 'rgba(255,110,110,.45)', animation: faceAnim }} />
        <div style={{ position: 'absolute', left: 12, top: 9, width: 3, height: eyeH, background: INK, borderRadius: 2, animation: faceAnim }} />
        <div style={{ position: 'absolute', left: 19, top: 9, width: 3, height: eyeH, background: INK, borderRadius: 2, animation: faceAnim }} />
        <div style={{ position: 'absolute', ...mouth, animation: faceAnim }} />
      </div>
      {hr.front}
    </div>
  );
  const BALL: Record<string, string> = {
    catch: 'ball-in 1.6s linear both',
    catchTD: 'ball-in 1.9s linear both',
    run: 'ball-hold 1.5s linear both',
    td: 'ball-hold 1.9s linear both',
    takeaway: 'ball-hold 1.6s linear both',
    throw: 'ball-throw 1.4s linear both',
    throwTD: 'ball-throw 1.4s linear both',
    int: 'ball-throw 1.2s linear both',
    fumble: 'ball-fumble 1.4s linear both',
    kick: 'ball-kick 1.4s linear both',
  };
  const ball = !BANNER && a && BALL[a] ? (
    <div
      key="ball"
      style={{ position: 'absolute', left: 24, bottom: a === 'kick' ? 1 : 15, width: 12, height: 8, background: '#8a4b22', border: B, borderRadius: '50%', animation: BALL[a], opacity: 0, zIndex: 3 }}
    >
      <div style={{ position: 'absolute', left: 3, right: 3, top: 1, height: 1.5, background: CREAM }} />
    </div>
  ) : null;
  const celBall = C && C.ball ? (
    <div
      key="celball"
      style={{ position: 'absolute', left: 24, bottom: 15, width: 12, height: 8, background: '#8a4b22', border: B, borderRadius: '50%', animation: 'cel-spike-ball 1.8s steps(18) infinite', opacity: 0, zIndex: 3 }}
    >
      <div style={{ position: 'absolute', left: 3, right: 3, top: 1, height: 1.5, background: CREAM }} />
    </div>
  ) : null;
  const pack = boost ? [
    <div
      key="fl2"
      style={{ position: 'absolute', left: -2, bottom: -1, width: 8, height: 14, background: '#ffd23f', border: '1.5px solid ' + INK, borderRadius: '50% 50% 50% 50% / 30% 30% 70% 70%', transformOrigin: '50% 0', animation: 'flame .18s steps(3) infinite alternate' }}
    />,
    <div
      key="fl1"
      style={{ position: 'absolute', left: 0, bottom: 3, width: 4, height: 8, background: '#ff7a2f', borderRadius: '50% 50% 50% 50% / 30% 30% 70% 70%', transformOrigin: '50% 0', animation: 'flame .14s steps(3) infinite alternate-reverse' }}
    />,
    <div
      key="jp"
      style={{ position: 'absolute', left: -3, bottom: 12, width: 9, height: 15, background: '#b9c0c7', border: B, borderRadius: '4px 4px 2px 2px' }}
    >
      <div style={{ position: 'absolute', left: 1, right: 1, top: 3, height: 2, background: '#e5583f' }} />
    </div>,
  ] : [];
  return (
    <div
      key={nap ? 'nap' : ev ? 'a' + ev.id : boost ? 'boost' : 'idle'}
      style={{ position: 'absolute', inset: 0, animation: bodyAnim, transform: nap ? 'rotate(78deg)' : !a && isOut ? 'rotate(-10deg) translateY(2px)' : 'none', transformOrigin: nap ? '50% 96%' : '50% 90%' }}
    >
      {pack}
      {arm(3, armB, 'ab')}
      {leg(10, legAnim(0, C ? C.legB : null), 'l1')}
      {leg(18, a === 'kick' ? 'leg-kick 1.4s steps(18)' : legAnim(0.08, C ? C.legF : null), 'l2')}
      <div
        key="body"
        style={{ position: 'absolute', left: 5, bottom: 11, width: 24, height: 16, background: T.c1, border: B, borderRadius: '8px 8px 4px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Silkscreen', monospace", fontWeight: 700, fontSize: 9, color: T.numC || '#fff', lineHeight: 1 }}
      >
        {String(p.num)}
      </div>
      {arm(25, armF, 'af')}
      {head}
      {ball}
      {celBall}
    </div>
  );
}

export function CelebrationFigure({ player, colors, event, size }: { player: Player; colors: TeamColors; event: PlayEvent; size: number }): JSX.Element {
  return (
    <div style={{ position: 'relative', width: 34 * size, height: 42 * size, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 34, height: 42, transform: `scale(${size})`, transformOrigin: '0 0' }}>
        {figure(player, colors, ANIM[event.kind], event, false, 0, false, false, celebrationOf(event))}
      </div>
    </div>
  );
}

function fx(T: TeamColors, a: string | null, ev: PlayEvent): JSX.Element {
  const kids: JSX.Element[] = [];
  const pts = ev.pts ?? 0;
  const TD = a === 'td' || a === 'catchTD' || a === 'throwTD';
  if (Math.abs(pts) > 0.001) {
    kids.push(
      <div
        key="pop"
        style={{ position: 'absolute', left: 28, top: -12, fontFamily: "'Silkscreen', monospace", fontWeight: 700, fontSize: 12, lineHeight: 1, color: INK, background: pts > 0 ? '#b8f06a' : '#ff8a73', border: '2px solid ' + INK, padding: '2px 4px', borderRadius: 4, whiteSpace: 'nowrap', opacity: 0, animation: 'pop 1.5s steps(15) .45s both', zIndex: 8 }}
      >
        {sgn(pts)}
      </div>,
    );
  }
  const BADGE: Record<string, string> = {
    catchTD: 'TD!',
    td: ev.kind === 'dtd' ? 'PICK 6!' : 'TD!',
    throwTD: 'TD PASS!',
    int: 'INT',
    fumble: 'FUMBLE',
    kick: ev.kind === 'xp' ? 'XP GOOD' : 'GOOD!',
    sack: 'SACK!',
    takeaway: ev.kind === 'dint' ? 'PICK!' : 'BALL!',
    hurt: 'OUCH',
  };
  const bad = a === 'int' || a === 'fumble' || a === 'hurt';
  if (a && BADGE[a]) {
    kids.push(
      <div
        key="bdg"
        style={{ position: 'absolute', left: -10, top: -34, fontFamily: "'Lilita One', sans-serif", fontSize: 15, lineHeight: 1.1, color: bad ? CREAM : INK, background: bad ? '#e5583f' : '#ffd23f', border: '2px solid ' + INK, borderRadius: 6, padding: '2px 6px', whiteSpace: 'nowrap', opacity: 0, zIndex: 9, animation: TD ? 'badge 1.3s steps(13) .95s both' : 'badge 1.4s steps(14) .2s both' }}
      >
        {BADGE[a]}
      </div>,
    );
  }
  if (TD) {
    const cols = [T.c1, T.c2, '#ffd23f', CREAM];
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2;
      const r = 30 + (k % 3) * 10;
      kids.push(
        <div
          key={'cf' + k}
          style={{
            position: 'absolute',
            left: 15,
            top: 6,
            width: 6,
            height: 6,
            background: cols[k % 4],
            border: '1.5px solid ' + INK,
            opacity: 0,
            '--dx': Math.round(Math.cos(ang) * r) + 'px',
            '--dy': Math.round(Math.sin(ang) * r - 18) + 'px',
            animation: 'confetti 1s ease-out 1.1s both',
          } as CSSProperties}
        />,
      );
    }
  }
  return (
    <div key={'fx' + ev.id} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {kids}
    </div>
  );
}

export function Avatar({ player: p, colors: T, side, lane: i, pts, event: ev, out: isOut, scrubbing, showTag: showTags, scale, napping: nap, offset: off, compact = false }: AvatarProps): JSX.Element {
  const a = ev && !nap ? ANIM[ev.kind] : null;
  const boost = !nap && !isOut && pts >= p.proj * 1.5;
  const lines = boost && !a ? [0, 1, 2].map(k => (
    <div
      key={'sl' + k}
      style={{ position: 'absolute', left: -14 - k * 4, top: 14 + k * 8, width: 12 - k * 2, height: 2, background: CREAM, borderRadius: 1, opacity: 0, animation: `speedline .6s steps(6) ${(k * 0.2).toFixed(1)}s infinite`, pointerEvents: 'none' }}
    />
  )) : [];
  const zs = nap ? [0, 1, 2].map(k => (
    <div
      key={'z' + k}
      style={{ position: 'absolute', left: 46 + k * 4, top: 10 - k * 4, fontFamily: "'Lilita One', sans-serif", fontSize: 10 + k * 3, lineHeight: 1, color: CREAM, WebkitTextStroke: '1px ' + INK, opacity: 0, animation: `zzz 2.4s steps(12) ${(k * 0.8 + i * 0.2).toFixed(2)}s infinite`, pointerEvents: 'none' }}
    >
      z
    </div>
  )) : [];
  const pct = Math.max(0, pts / scale * 100 - (off || 0));
  const tagRight = pct > (compact ? 55 : 78);
  return (
    <div
      style={{ position: 'absolute', left: trackLeft(pct / 100), bottom: 1, width: 34, height: 42, marginLeft: -17, zIndex: a ? 9 : 2, transition: scrubbing ? 'left .15s linear' : 'left 1s cubic-bezier(.3,.75,.35,1) .4s', filter: isOut ? 'grayscale(.85)' : 'none' }}
    >
      <div key="sh" style={{ position: 'absolute', left: 6, bottom: 0, width: 22, height: 5, borderRadius: '50%', background: 'rgba(20,40,10,.35)' }} />
      {lines}
      {figure(p, T, a, ev, isOut, i + (side === 'opp' ? 5 : 0), nap, boost)}
      {ev && !nap ? fx(T, a, ev) : null}
      {zs}
      {showTags && !nap ? (
        <div
          key="tag"
          style={{ position: 'absolute', ...(tagRight ? { right: 32 } : { left: 32 }), top: 16, background: side === 'me' ? '#1f3f86' : '#8a2a1a', color: CREAM, border: '1.5px solid ' + INK, fontFamily: "'Silkscreen', monospace", fontSize: 9, lineHeight: 1, padding: '3px 4px', borderRadius: 3, whiteSpace: 'nowrap', pointerEvents: 'none' }}
        >
          {`${p.tag || p.last.toUpperCase()} ${fmt(pts)}`}
        </div>
      ) : null}
      {isOut ? (
        <div
          key="out"
          style={{ position: 'absolute', top: -6, right: -8, background: '#e5583f', color: CREAM, border: '2px solid ' + INK, fontFamily: "'Silkscreen', monospace", fontWeight: 700, fontSize: 8, lineHeight: 1, padding: '2px 3px', borderRadius: 3 }}
        >
          OUT
        </div>
      ) : null}
    </div>
  );
}
