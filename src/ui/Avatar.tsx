import type { CSSProperties } from 'react';
import { fmt, sgn } from '../model/derive';
import type { EventKind, PlayEvent, Player, Side, TeamColors } from '../model/types';
import { CREAM, DEFAULT_HAIR, Head, INK } from './Head';

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

// Limb pivots in the 34x42 figure box: shoulders for the arms, hips for the legs.
const PIVOT = { armB: '8.6px 20px', armF: '25.4px 20px', legB: '13.4px 29px', legF: '20.6px 29px' };

// An arm is a sleeve-topped stroke hanging from the shoulder, outlined by a fatter ink stroke under it.
function armArt(d: string, sleeve: string, skin: string, c1: string): JSX.Element {
  return (
    <>
      <path d={d} stroke={INK} strokeWidth={6.4} strokeLinecap="round" fill="none" />
      <path d={d} stroke={skin} strokeWidth={3.2} strokeLinecap="round" fill="none" />
      <path d={sleeve} stroke={c1} strokeWidth={3.4} strokeLinecap="round" fill="none" />
    </>
  );
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
  const skin = p.sc ?? SK[p.skin];
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
  const limb = (origin: string, anim: string): CSSProperties => ({ transformBox: 'view-box', transformOrigin: origin, animation: anim });
  const leg = (x: number, origin: string, anim: string) => (
    <g style={limb(origin, anim)}>
      <rect x={x} y={29} width={6} height={8.6} rx={1.6} fill={T.c2} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <path d={`M${x - 0.6} 37.6 h7.6 a1.4 1.4 0 0 1 0 2.8 h-7.6 z`} fill={INK} />
    </g>
  );
  const armFbase = BANNER ? 'none'
    : (a === 'throw' || a === 'throwTD' || a === 'int') ? 'arm-throw 1.4s steps(18)'
      : (a === 'catch' || a === 'takeaway') ? 'arm-up-f 1.6s steps(20)' : 'none';
  const armBbase = BANNER ? 'none'
    : (a === 'catch' || a === 'takeaway') ? 'arm-up-b 1.6s steps(20)' : 'none';
  const armF = withCel(armFbase, C ? C.armF : null);
  const armB = withCel(armBbase, C ? C.armB : null);
  const mood = BANNER ? 'happy'
    : (a === 'int' || a === 'fumble' || a === 'hurt' || (isOut && !a)) ? 'sad'
      : (TD || a === 'catch' || a === 'takeaway' || a === 'sack') ? 'happy' : 'norm';
  const faceAnim = C && C.face ? 'cel-face-away 1.8s steps(1) infinite' : undefined;
  const art = (
    <svg key="art" width={34} height={42} viewBox="0 0 34 42" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      <g style={limb(PIVOT.armB, armB)}>{armArt('M8.6 20 C6.4 22 5.4 25 5.4 28', 'M8.8 19.6 C7.4 20.6 6.6 21.8 6.2 23', skin, T.c1)}</g>
      {leg(10.4, PIVOT.legB, legAnim(0, C ? C.legB : null))}
      {leg(17.6, PIVOT.legF, a === 'kick' ? 'leg-kick 1.4s steps(18)' : legAnim(0.08, C ? C.legF : null))}
      <path
        d="M9.6 17 C11.5 16 22.5 16 24.4 17 C26 17.6 26.6 19 26.4 21 L25.4 30.6 C25.3 31.4 24.7 32 23.8 32 H10.2 C9.3 32 8.7 31.4 8.6 30.6 L7.6 21 C7.4 19 8 17.6 9.6 17 Z"
        fill={T.c1}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <text x={17} y={28.2} textAnchor="middle" fontFamily="'Silkscreen', monospace" fontWeight={700} fontSize={8.5} fill={T.numC || '#fff'}>{String(p.num)}</text>
      <g style={limb(PIVOT.armF, armF)}>{armArt('M25.4 20 C27.6 22 28.6 25 28.6 28', 'M25.2 19.6 C26.6 20.6 27.4 21.8 27.8 23', skin, T.c1)}</g>
      <g transform="translate(17 5.2)">
        <Head
          hair={p.hair}
          hc={p.hc ?? DEFAULT_HAIR}
          skin={skin}
          beard={p.beard ?? 'none'}
          band={p.band}
          mood={nap ? 'nap' : mood}
          colors={T}
          faceAnim={faceAnim}
        />
      </g>
    </svg>
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
      {art}
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
