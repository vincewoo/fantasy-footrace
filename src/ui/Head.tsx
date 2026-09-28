import { useId, type CSSProperties, type ReactNode } from 'react';
import type { Beard, Hair, TeamColors } from '../model/types';

export const INK = '#1c1a22';
export const CREAM = '#fffaf0';
export const DEFAULT_HAIR = '#1d1411';

function rgb(hex: string): number[] {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
}

export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Texture strokes go lighter on dark hair and darker on light hair, so the ink outline never swallows them.
function shade(hc: string): string {
  return luminance(hc) < 90 ? mix(hc, '#ffffff', 0.28) : mix(hc, INK, 0.3);
}

type Mood = 'norm' | 'happy' | 'sad' | 'nap';

export interface HeadProps {
  hair: Hair;
  hc: string;
  skin: string;
  beard: Beard;
  band?: string;
  mood: Mood;
  colors: TeamColors;
  faceAnim?: string;
}

// Head-local coordinates: the skull is an ellipse centred on (0,0), rx 13, ry 11.5, with the face
// turned right. Hair and beards are shapes clipped to a region (above the hairline, below the
// jaw), so only their outer edge, where it stands off the skull, carries the ink outline.
const HAIRLINE = 'M30 -40 L30 -16 L12.2 -5.6 C7 -6.8 0 -6.6 -3.6 -4.4 C-6.6 -2.6 -9.6 -0.2 -12.4 1.8 L-40 3.4 L-40 -40 Z';
const HAIRLINE_HIGH = 'M30 -40 L30 -18 L11.6 -6.8 C7 -8 0 -8 -3.6 -6.8 L-40 -6.8 L-40 -40 Z';
const JAW = 'M-40 1.8 L-12.4 1.8 C-9.4 3.2 -6.4 4.6 -3.2 4.8 C-1 4.8 0 3.8 1.4 3.4 C4 2.4 8.4 2.2 10.6 3 L13 8.4 L40 24 L40 40 L-40 40 Z';
// Helmet shell: dome over the skull, brow line above the eyes, jaw flap down the far cheek.
const SHELL = 'M12.6 -6.6 C14 -12.4 6 -16 -2.6 -15.6 C-11 -15.2 -16.2 -9.2 -16.2 -2 C-16.2 3 -14.2 7.2 -10.8 9.8 L-5.4 10 C-4.4 7.4 -3.8 4.4 -3.6 1.2 C-3.4 -3.4 -1.4 -6.6 2.4 -7.4 C6 -8 10 -7.8 12.6 -6.6 Z';
const MASK_GREY = '#a3aab1';

const OUTLINE = { stroke: INK, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

type Paint = { fill: string; stroke?: string; strokeWidth?: number };

// A shape in hair color cut to a region: drawn once fat in ink, then filled on top, so the
// outline shows only along the shape's own edge and never along the cut.
function capped(clip: string, shape: (paint: Paint) => ReactNode, hc: string): JSX.Element {
  return (
    <g clipPath={`url(#${clip})`}>
      {shape({ fill: INK, stroke: INK, strokeWidth: 4 })}
      {shape({ fill: hc })}
    </g>
  );
}

function texture(color: string, d: string, width = 1): JSX.Element {
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />;
}

function skullFill(clip: string, fill: string, extra: ReactNode = null): JSX.Element {
  return (
    <g clipPath={`url(#${clip})`}>
      <ellipse rx={12} ry={10.5} fill={fill} />
      {extra}
    </g>
  );
}

const CURLS: [number, number, number][] = [[-12, -2.4, 3], [-11, -7.4, 3.4], [-7.4, -11.4, 3.6], [-2, -13.4, 3.6], [3.6, -13, 3.6], [8.6, -10.6, 3.4], [11.8, -6.6, 3]];
const LOCS: [number, number, number, number][] = [[-11, -4, -14.6, 14], [-8.4, -2, -10.8, 15.6], [-5.6, 0, -7, 14.4], [-12.6, -8, -17.2, 8]];
const BUZZ_DOTS: [number, number][] = [[-8, -7], [-4, -9], [1, -9.4], [5, -8.4], [-10, -3], [8.5, -6.6], [-6.6, -3.4], [-1.6, -6.8]];

const shortCap = (paint: Paint) => <ellipse cx={0} cy={-1.4} rx={13.9} ry={12.9} {...paint} />;

function hairBack(hair: Hair, hc: string): ReactNode {
  const tx = shade(hc);
  switch (hair) {
    case 'afro':
      return (
        <>
          <ellipse cx={-1.4} cy={-5.4} rx={17.6} ry={15.2} fill={hc} {...OUTLINE} />
          {texture(tx, 'M-12 -12 q2 -2 4 0 M-4 -17 q2 -2 4 0 M5 -16 q2 -2 4 0 M-15.4 -4 q2 -2 4 0 M11 -11 q2 -2 4 0', 0.9)}
        </>
      );
    case 'locs':
      return LOCS.map(([x0, y0, x1, y1], k) => {
        const d = `M${x0} ${y0} Q${x1 + 1} ${(y0 + y1) / 2} ${x1} ${y1}`;
        return (
          <g key={k}>
            <path d={d} fill="none" stroke={INK} strokeWidth={5.6} strokeLinecap="round" />
            <path d={d} fill="none" stroke={hc} strokeWidth={2.8} strokeLinecap="round" />
          </g>
        );
      });
    case 'long':
      return (
        <>
          <path d="M-12.6 -5 C-16.4 2 -16 11 -12.6 16.4 L-4.4 16.4 C-6.4 11 -7.4 5 -6.4 -1 Z" fill={hc} {...OUTLINE} />
          {texture(tx, 'M-12 4 Q-12.4 10 -10.4 14.6 M-9 4 Q-9.4 10 -7.6 14.6')}
        </>
      );
    case 'bun':
      return (
        <>
          <circle cx={-4} cy={-14.6} r={4.4} fill={hc} {...OUTLINE} />
          {texture(tx, 'M-6.2 -15.4 q2.2 -1.5 4.4 0', 0.9)}
        </>
      );
    default:
      return null;
  }
}

function hairFront(hair: Hair, hc: string, skin: string, ids: { line: string; high: string; helmet: string }, T: TeamColors): ReactNode {
  const tx = shade(hc);
  switch (hair) {
    case 'bald':
      return texture(mix(skin, '#ffffff', 0.5), 'M3 -9 Q7 -8.6 9.4 -6.4', 1.6);
    case 'buzz': {
      const c = mix(skin, hc, 0.6);
      const dot = mix(c, INK, 0.4);
      return skullFill(ids.line, c, BUZZ_DOTS.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={0.55} fill={dot} />));
    }
    case 'short':
      return (
        <>
          {capped(ids.line, shortCap, hc)}
          {texture(tx, 'M-5 -11.6 Q0 -13 5 -11.8 M-9.4 -7.6 Q-6 -9.4 -2 -9.2')}
        </>
      );
    case 'fade':
      return (
        <>
          {skullFill(ids.line, mix(skin, hc, 0.5))}
          {capped(ids.high, paint => <ellipse cx={0.6} cy={-2.6} rx={13.6} ry={13.4} {...paint} />, hc)}
          {texture(tx, 'M-5 -13 Q0 -14.4 5 -13.2')}
        </>
      );
    case 'curly':
      return (
        <>
          {capped(ids.line, paint => (
            <g {...paint}>
              <ellipse cx={0} cy={-1} rx={12.6} ry={11.4} />
              {CURLS.map(([x, y, r], k) => <circle key={k} cx={x} cy={y} r={r} />)}
            </g>
          ), hc)}
          {CURLS.slice(1, 6).map(([x, y], k) => <g key={k}>{texture(tx, `M${x - 1.3} ${y + 0.5} q1.3 -1.7 2.6 0`, 0.9)}</g>)}
        </>
      );
    case 'afro':
      return skullFill(ids.line, hc);
    case 'locs':
      return (
        <>
          {capped(ids.line, shortCap, hc)}
          {texture(tx, 'M-9 -9.6 L-6 -5.4 M-4 -12.4 L-2 -6.8 M2 -12.8 L3.2 -7.2 M7.6 -11 L8 -6.2', 0.9)}
        </>
      );
    case 'long':
      return (
        <>
          {capped(ids.line, paint => <path d="M-14 4 C-15.6 -8 -9 -14.6 0.4 -14.6 C9.6 -14.6 14.6 -9.4 13.8 -2 C10 -7 5 -8.6 0 -7.4 Z" {...paint} />, hc)}
          {texture(tx, 'M-7 -11.6 Q0 -13.2 6 -10.6')}
        </>
      );
    case 'bun':
      return (
        <>
          {capped(ids.line, paint => <ellipse cx={0} cy={-1} rx={13.5} ry={12.3} {...paint} />, hc)}
          {texture(tx, 'M-9 -7.4 Q-3 -11.6 5 -9.6', 0.9)}
        </>
      );
    case 'helmet': {
      const hole = mix(T.c1, INK, 0.55);
      const bar = (d: string) => (
        <>
          <path d={d} fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke={MASK_GREY} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
      return (
        <>
          <path d={SHELL} fill={T.c1} />
          <g clipPath={`url(#${ids.helmet})`}>
            <path d="M11.4 -8 C6 -16.4 -8 -17 -15.6 -6.4" fill="none" stroke={INK} strokeWidth={5} />
            <path d="M11.4 -8 C6 -16.4 -8 -17 -15.6 -6.4" fill="none" stroke={T.c2} strokeWidth={3} />
            <path d="M-12 -14 C-6 -10 2 -11 8 -14" fill="none" stroke={mix(T.c1, '#ffffff', 0.35)} strokeWidth={1.2} strokeLinecap="round" opacity={0.7} />
          </g>
          <circle cx={-8} cy={-3.4} r={3.2} fill={T.c2} stroke={INK} strokeWidth={1.2} />
          <ellipse cx={-8.6} cy={4.4} rx={1.4} ry={1.8} fill={hole} />
          <path d={SHELL} fill="none" {...OUTLINE} />
          {bar('M-3.4 1.4 C3 0.6 10 0.4 14 1.4 M-4 7.2 C2 9.6 8.6 10.6 13 8.8 M14 1.4 C15 4 14.6 7 13 8.8')}
        </>
      );
    }
  }
}

function mustache(hc: string): JSX.Element {
  return (
    <path
      d="M1.8 3.4 C3.6 2.2 5.8 2.4 7 3.2 C8.4 2.4 10.4 2.4 11.4 3.6 C10 4.8 8.4 4.6 7 4.2 C5.4 4.8 3.4 4.8 1.8 3.4 Z"
      fill={hc}
      stroke={INK}
      strokeWidth={0.8}
      strokeLinejoin="round"
    />
  );
}

// Beards are cut to the jaw and bulge a little past the chin; the mouth sits in a skin-colored gap.
function beardArt(beard: Beard, hc: string, skin: string, jaw: string): ReactNode {
  switch (beard) {
    case 'none':
    case 'mustache':
      return null;
    case 'stubble':
      return skullFill(jaw, mix(skin, hc, 0.4));
    case 'goatee':
      return <path d="M3.6 7.4 C5 7 8.6 7 9.8 7.4 C9.8 10 8.4 11.2 6.7 11.2 C5 11.2 3.6 10 3.6 7.4 Z" fill={hc} stroke={INK} strokeWidth={0.8} />;
    case 'full':
      return (
        <>
          {capped(jaw, paint => <ellipse cx={0.6} cy={1} rx={13} ry={12.4} {...paint} />, hc)}
          {texture(shade(hc), 'M-3.6 6.4 Q-1 9.6 2.6 10.6', 0.9)}
        </>
      );
  }
}

function mouthArt(mood: Mood): JSX.Element {
  switch (mood) {
    case 'happy':
      return (
        <>
          <path d="M3.6 4.6 H9.8 Q9.4 8.2 6.7 8.2 Q4 8.2 3.6 4.6 Z" fill={INK} />
          <path d="M4.6 5.2 H8.8" stroke={CREAM} strokeWidth={1} />
        </>
      );
    case 'sad':
      return <path d="M4.2 7.2 Q6.7 4.6 9.2 7.2" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />;
    case 'nap':
      return <ellipse cx={6.7} cy={6} rx={1.6} ry={1.8} fill={INK} />;
    case 'norm':
      return <path d="M4.6 5.6 H8.8" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />;
  }
}

export function Head({ hair, hc, skin, beard, band, mood, colors, faceAnim }: HeadProps): JSX.Element {
  const id = 'hd' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids = { line: id + 'l', high: id + 'h', helmet: id + 'm' };
  const jaw = id + 'j';
  const eyeH = mood === 'nap' ? 1.4 : mood === 'happy' ? 2.4 : 4;
  const gap = beard === 'full' || beard === 'goatee' || beard === 'stubble';
  const face: CSSProperties | undefined = faceAnim ? { animation: faceAnim } : undefined;
  return (
    <g>
      <defs>
        <clipPath id={ids.line}><path d={HAIRLINE} /></clipPath>
        <clipPath id={ids.high}><path d={HAIRLINE_HIGH} /></clipPath>
        <clipPath id={ids.helmet}><path d={SHELL} /></clipPath>
        <clipPath id={jaw}><path d={JAW} /></clipPath>
      </defs>
      {hairBack(hair, hc)}
      <ellipse rx={13} ry={11.5} fill={skin} {...OUTLINE} />
      {beardArt(beard, hc, skin, jaw)}
      <g style={face}>
        {gap ? <ellipse cx={6.8} cy={mood === 'happy' ? 6.2 : 5.6} rx={4} ry={mood === 'happy' ? 3 : 2} fill={skin} /> : null}
        <rect x={-1.2} y={-3 - eyeH / 2} width={3} height={eyeH} rx={Math.min(1.4, eyeH / 2)} fill={INK} />
        <rect x={5.4} y={-3 - eyeH / 2} width={3} height={eyeH} rx={Math.min(1.4, eyeH / 2)} fill={INK} />
        {mouthArt(mood)}
        {beard === 'mustache' || beard === 'goatee' || beard === 'full' ? mustache(hc) : null}
      </g>
      {hairFront(hair, hc, skin, ids, colors)}
      {band && hair !== 'helmet' ? (
        <>
          <path d="M-12 -6.6 L-15.4 -3 L-13.6 -1.8 L-11.6 -4.4 Z" fill={band} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
          <path d="M-13.3 -5.6 C-8 -9.6 7 -9.8 13.2 -5.4 L13.3 -2.6 C7 -6.8 -8 -6.6 -13.3 -2.4 Z" fill={band} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
        </>
      ) : null}
    </g>
  );
}
