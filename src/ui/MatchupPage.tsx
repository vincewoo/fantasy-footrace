import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { fmt, sgn, snapshotAt } from '../model/derive';
import type { PlayEvent, Player, Side, Slate } from '../model/types';
import { Avatar } from './Avatar';
import { advance, cycleSpeed, followLive, goLive, initPlayback, scrubTo, togglePlay, type Playback } from './playback';

const INK = '#1c1a22';
const ME = '#4a82f0';
const OPP = '#e5583f';
const CREAM = '#fffaf0';
const ME_TXT = '#2f5fc4';
const OPP_TXT = '#c23e27';
const LILITA = "'Lilita One', sans-serif";
const SILK = "'Silkscreen', monospace";
const STORAGE_KEY = 'gd_sim_v1';
export const SOUND_KEY = 'ff_sound';

const TDK: Record<string, boolean> = { passTD: true, rushTD: true, recTD: true, dtd: true };
const RANK: Record<string, number> = { td: 5, hurt: 4, bad: 3, kick: 2, pos: 1 };
const TAUNTS = ['TOO EASY', 'SCOREBOARD!', 'LUCKY BOUNCE', 'BENCH HIM', 'WAIT TILL SNF', 'GG NO RE'];
const REPLIES = ["WE'LL SEE", 'PUNT IT, PAL', 'CHECK THE PROJ', 'SNF IS MINE', 'LOL OK', 'COPE', 'ZZZ'];
const OPP_TAUNTS = ['TOO EASY', 'SCOREBOARD', 'SIT DOWN', 'HE COOKS'];

type Sound = 'td' | 'bad' | 'kick' | 'hurt' | 'pos' | 'taunt' | 'reply';

const SFX: Record<Sound, { notes: [number, number][]; wave: OscillatorType; vol: number }> = {
  td: { notes: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.2]], wave: 'square', vol: 0.06 },
  bad: { notes: [[330, 0.1], [220, 0.1], [150, 0.22]], wave: 'sawtooth', vol: 0.04 },
  kick: { notes: [[392, 0.06], [784, 0.12]], wave: 'square', vol: 0.045 },
  hurt: { notes: [[220, 0.15], [150, 0.28]], wave: 'triangle', vol: 0.08 },
  pos: { notes: [[880, 0.05], [1320, 0.07]], wave: 'square', vol: 0.035 },
  taunt: { notes: [[600, 0.05], [900, 0.06]], wave: 'square', vol: 0.04 },
  reply: { notes: [[500, 0.05], [350, 0.08]], wave: 'square', vol: 0.04 },
};

interface Bubble {
  id: number;
  text: string;
}

interface Banner {
  id: number;
  text: string;
  good: boolean;
  e: PlayEvent;
}

interface PageState extends Playback {
  sound: boolean;
  anims: Record<string, PlayEvent>;
  banner: Banner | null;
  bubbles: { me: Bubble | null; opp: Bubble | null };
  w: number;
}

function readSaved(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return undefined;
  }
}

function persist(key: string, t: number, liveT: number, speed: number): void {
  try {
    localStorage.setItem(key, JSON.stringify({ t, liveT, speed }));
  } catch {
    // storage stays optional: a node render, private mode or a blocked origin all throw
  }
}

export function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveSoundPref(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // storage stays optional: a node render, private mode or a blocked origin all throw
  }
}

function axisLeft(t: number): string {
  return Number((t * 100).toFixed(2)) + '%';
}

export function laneKey(side: Side, lane: number): string {
  return `${side}${lane}`;
}

export interface MatchupPageProps {
  slate: Slate;
  slateMinutes?: number;
  showTags?: boolean;
  subtitle?: string;
  headerExtra?: ReactNode;
  liveNow?: () => number;
  liveClock?: () => string;
  initialWidth?: number;
  storageKey?: string;
  talk?: { send(text: string): boolean; connected: boolean; oppWatching: boolean } | null;
  remoteTaunt?: { id: number; text: string } | null;
}

export function MatchupPage({
  slate,
  slateMinutes = 4,
  showTags = true,
  subtitle = 'WEEK 4 · SUNDAY SLATE · BACKYARD LEAGUE',
  headerExtra,
  liveNow,
  liveClock,
  initialWidth = 1200,
  storageKey = STORAGE_KEY,
  talk = null,
  remoteTaunt = null,
}: MatchupPageProps): JSX.Element {
  const [state, setState] = useState<PageState>(() => ({
    ...initPlayback(readSaved(storageKey)),
    sound: readSoundPref(),
    anims: {},
    banner: null,
    bubbles: { me: null, opp: null },
    w: initialWidth,
  }));
  const [pressed, setPressed] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const stateRef = useRef(state);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const firedAtRef = useRef<Record<string, number>>({});
  const bidRef = useRef(0);
  const acRef = useRef<AudioContext | null>(null);

  const apply = (next: PageState) => {
    stateRef.current = next;
    setState(next);
  };

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };

  const sfx = (kind: Sound) => {
    const ac = acRef.current;
    if (!stateRef.current.sound || !ac) return;
    const s = SFX[kind];
    if (!s) return;
    let t0 = ac.currentTime;
    s.notes.forEach(([f, d]) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = s.wave;
      o.frequency.value = f;
      g.gain.setValueAtTime(s.vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t0);
      o.stop(t0 + d + 0.02);
      t0 += d * 0.9;
    });
  };

  const ensureAudio = () => {
    if (!acRef.current) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) acRef.current = new Ctor();
      } catch {
        // no WebAudio here: the toggle still flips, it just stays silent
      }
    }
    const ac = acRef.current;
    if (ac && ac.state === 'suspended') void ac.resume();
  };

  const toggleSound = () => {
    ensureAudio();
    const next = !stateRef.current.sound;
    apply({ ...stateRef.current, sound: next });
    saveSoundPref(next);
    sfx('pos');
  };

  const togglePlaying = () => {
    const s = stateRef.current;
    const ended = s.t >= 1 && s.liveT >= 1;
    apply({ ...s, ...togglePlay(s), anims: ended ? {} : s.anims, banner: ended ? null : s.banner });
  };

  const nextSpeed = () => {
    const s = stateRef.current;
    const next = cycleSpeed(s);
    apply({ ...s, ...next });
    persist(storageKey, next.t, next.liveT, next.speed);
  };

  const jumpLive = () => {
    const s = stateRef.current;
    apply({ ...s, ...goLive(s), anims: {}, banner: null });
  };

  const scrubAt = (x: number) => {
    const el = scrubRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = stateRef.current;
    const next = scrubTo(s, (x - r.left) / r.width);
    apply({ ...s, ...next, anims: {}, banner: null });
    persist(storageKey, next.t, next.liveT, next.speed);
  };

  const scrubDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    apply({ ...stateRef.current, scrubbing: true });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture is best effort
    }
    scrubAt(e.clientX);
  };

  const scrubMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stateRef.current.scrubbing) scrubAt(e.clientX);
  };

  const scrubUp = () => {
    if (!stateRef.current.scrubbing) return;
    apply({ ...stateRef.current, scrubbing: false });
  };

  const sendTaunt = (text: string) => {
    const s = stateRef.current;
    apply({ ...s, bubbles: { ...s.bubbles, me: { id: ++bidRef.current, text } } });
    sfx('taunt');
    if (liveNow) {
      talk?.send(text);
      return;
    }
    later(() => {
      const cur = stateRef.current;
      const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];
      apply({ ...cur, bubbles: { ...cur.bubbles, opp: { id: ++bidRef.current, text: reply } } });
      sfx('reply');
    }, 1400);
  };

  const press = (key: string) => ({
    onPointerDown: () => setPressed(key),
    onPointerUp: () => setPressed(null),
    onPointerCancel: () => setPressed(null),
    onPointerLeave: () => setPressed(null),
  });

  const pressedStyle = (key: string, shift: number): CSSProperties =>
    pressed === key ? { transform: `translateY(${shift}px)`, boxShadow: '0 1px 0 ' + INK } : {};

  useEffect(() => {
    const iv = setInterval(() => {
      const s = stateRef.current;
      if (!s.playing) return;
      const advanced = advance(s, slateMinutes);
      const next = liveNow ? followLive({ ...advanced, liveT: s.liveT }, liveNow()) : advanced;
      if (s.scrubbing) {
        apply({ ...s, ...next });
        return;
      }
      const prevT = s.t;
      const fired = slate.events.filter(e => e.t > prevT && e.t <= next.t);
      let anims = s.anims;
      let banner = s.banner;
      let bubbles = s.bubbles;
      let snd: Sound | null = null;
      if (fired.length) {
        anims = { ...anims };
        for (const e of fired) {
          const key = laneKey(e.side, e.lane);
          anims[key] = e;
          firedAtRef.current[key] = Date.now();
          later(() => apply({ ...stateRef.current }), TDK[e.kind] ? 3400 : 2200);
          const pts = e.pts ?? 0;
          let bt: string | null = null;
          if (TDK[e.kind]) bt = e.kind === 'dtd' ? 'PICK SIX!' : 'TOUCHDOWN!';
          else if (e.kind === 'int') bt = 'INTERCEPTED';
          else if (e.kind === 'fumble') bt = 'FUMBLE!';
          else if (e.kind === 'injury') bt = 'INJURY';
          if (bt) banner = { id: e.id, text: bt, good: !!TDK[e.kind], e };
          const k: Sound = TDK[e.kind] ? 'td'
            : e.kind === 'injury' ? 'hurt'
              : pts < 0 ? 'bad'
                : e.kind === 'fg' || e.kind === 'xp' ? 'kick'
                  : 'pos';
          if (!snd || RANK[k] > RANK[snd]) snd = k;
          if (!liveNow && TDK[e.kind] && e.side === 'opp' && Math.random() < 0.5) {
            bubbles = { ...bubbles, opp: { id: ++bidRef.current, text: OPP_TAUNTS[Math.floor(Math.random() * 4)] } };
          }
        }
      }
      apply({ ...s, ...next, anims, banner, bubbles });
      if (snd) sfx(snd);
      persist(storageKey, next.t, next.liveT, next.speed);
    }, 100);
    return () => clearInterval(iv);
  }, [slate, slateMinutes, liveNow, storageKey]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (Math.abs(w - stateRef.current.w) > 4) apply({ ...stateRef.current, w });
    });
    if (ro) ro.observe(el);
    apply({ ...stateRef.current, w: el.getBoundingClientRect().width });
    return () => {
      if (ro) ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const unlock = () => {
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
      ensureAudio();
    };
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
    };
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const remoteId = remoteTaunt ? remoteTaunt.id : 0;
  useEffect(() => {
    if (!remoteTaunt) return;
    const cur = stateRef.current;
    apply({ ...cur, bubbles: { ...cur.bubbles, opp: { id: ++bidRef.current, text: remoteTaunt.text } } });
    sfx('reply');
  }, [remoteId]);

  const { t, liveT, speed, scrubbing, sound, anims, banner, w } = state;
  const compact = w < 760;
  const snapshot = snapshotAt(slate, t);
  const out = snapshot.out;
  const totals = snapshot.totals;
  const projected = snapshot.projected;
  const past = snapshot.past;
  const wp = snapshot.winPct;
  const final = t >= 1;
  const isReplay = t < liveT - 0.002 && !final;
  const finished = t >= 1 && liveT >= 1;
  const now = Date.now();

  const info = (p: Player, ptsL: number, key: string) => ({
    name: p.name,
    ptsL: fmt(ptsL),
    sub: `${p.team} · ${out.has(key) ? 'OUT' : slate.statusLabel(p, t)} · proj ${fmt(p.proj)}`,
  });

  const act = (key: string): PlayEvent | null => {
    const e = anims[key];
    return e && e.t <= t && now - (firedAtRef.current[key] || 0) < (TDK[e.kind] ? 3300 : 2100) ? e : null;
  };

  const lanes = slate.lanes.map((lane, i) => {
    const me = lane.me;
    const opp = lane.opp;
    const a = snapshot.laneTotals[i].me;
    const b = snapshot.laneTotals[i].opp;
    const d = a - b;
    const lead = Math.max(a / (me.proj * 2), b / (opp.proj * 2)) * 100;
    const off = Math.max(0, lead - 88);
    const moveT = scrubbing
      ? 'all .15s linear'
      : 'transform 1s cubic-bezier(.3,.75,.35,1) .4s, left 1s cubic-bezier(.3,.75,.35,1) .4s, opacity .4s';
    return {
      slot: lane.slot,
      diffL: Math.abs(d) < 0.05 ? 'EVEN' : sgn(d),
      diffColor: d > 0.04 ? ME_TXT : d < -0.04 ? OPP_TXT : '#6b6475',
      stripeT: 'translateX(' + (-Math.min(off, 490) / 6).toFixed(3) + '%)',
      moveT,
      projLeft: 50 - off + '%',
      projOp: off > 50 ? 0 : 1,
      meProjL: fmt(me.proj),
      oppProjL: fmt(opp.proj),
      me: info(me, a, laneKey('me', i)),
      opp: info(opp, b, laneKey('opp', i)),
      meAv: (
        <Avatar
          player={me}
          colors={slate.teamColors[me.team]}
          side="me"
          lane={i}
          pts={a}
          event={act(laneKey('me', i))}
          out={out.has(laneKey('me', i))}
          scrubbing={scrubbing}
          showTag={showTags}
          scale={me.proj * 2}
          napping={t < me.window[0]}
          offset={off}
        />
      ),
      oppAv: (
        <Avatar
          player={opp}
          colors={slate.teamColors[opp.team]}
          side="opp"
          lane={i}
          pts={b}
          event={act(laneKey('opp', i))}
          out={out.has(laneKey('opp', i))}
          scrubbing={scrubbing}
          showTag={showTags}
          scale={opp.proj * 2}
          napping={t < opp.window[0]}
          offset={off}
        />
      ),
    };
  });

  const ticker = past.slice(-40).reverse().map(e => {
    const td = !!TDK[e.kind];
    return {
      id: e.id,
      text: e.text,
      meta: `${slate.clockLabel(e.t)} · ${slate.lanes[e.lane].slot} · ${e.side === 'me' ? slate.me.owner : slate.opp.owner}`,
      ptsL: e.kind === 'injury' ? 'OUT' : sgn(e.pts),
      pillBg: e.kind === 'injury' ? '#e0d8c4' : e.pts < 0 ? '#ff8a73' : td ? '#ffd23f' : '#b8f06a',
      sideColor: e.side === 'me' ? ME : OPP,
      bg: td ? '#fff3c4' : 'transparent',
    };
  });

  const bubbleEl = (b: Bubble | null, side: Side): JSX.Element | null => {
    if (!b) return null;
    const L: 'left' | 'right' = side === 'me' ? 'left' : 'right';
    return (
      <div key={b.id} style={{ position: 'absolute', top: -18, [L]: 30, zIndex: 10, animation: 'bubble 2.8s steps(28) forwards', pointerEvents: 'none' } as CSSProperties}>
        <div style={{ position: 'relative', background: CREAM, border: '3px solid ' + INK, borderRadius: 12, padding: '4px 12px', fontFamily: LILITA, fontSize: 17, color: INK, boxShadow: '0 3px 0 ' + INK, whiteSpace: 'nowrap' }}>
          {b.text}
          <div style={{ position: 'absolute', bottom: -8, [L]: 18, width: 12, height: 12, background: CREAM, borderRight: '3px solid ' + INK, borderBottom: '3px solid ' + INK, transform: 'rotate(45deg)' } as CSSProperties} />
        </div>
      </div>
    );
  };

  let bannerEl: JSX.Element | null = null;
  let bannerHost = -1;
  if (banner && banner.e.t <= t) {
    const bp = slate.lanes[banner.e.lane][banner.e.side];
    bannerHost = banner.e.lane;
    bannerEl = (
      <div key={'b' + banner.id} style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: 0, animation: 'banner 1.9s steps(19) forwards' }}>
          <div style={{ fontFamily: LILITA, fontSize: compact ? 38 : 68, lineHeight: 1, color: banner.good ? '#ffd23f' : '#ff8a73', WebkitTextStroke: (compact ? 2 : 3) + 'px ' + INK, textShadow: '0 5px 0 ' + INK, whiteSpace: 'nowrap' }}>{banner.text}</div>
          <div style={{ fontFamily: SILK, fontSize: 12, fontWeight: 700, color: CREAM, background: banner.e.side === 'me' ? '#1f3f86' : '#8a2a1a', border: '2px solid ' + INK, padding: '4px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>{`${bp.name.toUpperCase()} · ${banner.e.side === 'me' ? slate.me.owner : slate.opp.owner}`}</div>
        </div>
      </div>
    );
  }

  const clock = final ? 'FINAL' : liveClock && !isReplay && t < 1 ? liveClock() : slate.clockLabel(t);

  const axisNowStyle: CSSProperties = {
    position: 'absolute',
    top: 7,
    fontFamily: SILK,
    fontSize: 9,
    color: '#5b5566',
    whiteSpace: 'nowrap',
    ...(t < 0.15 ? { left: 0 } : t > 0.85 ? { right: 0 } : { left: t * 100 + '%', transform: 'translateX(-50%)' }),
  };

  return (
    <div ref={rootRef} style={{ minHeight: '100vh', background: '#efe8d6', color: '#1c1a22', fontFamily: "'Nunito', sans-serif", padding: '16px 14px 120px' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.svg" width={40} height={46} alt="Fantasy Footrace" style={{ display: 'block', flex: 'none', filter: 'drop-shadow(0 3px 0 #1c1a22)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontFamily: LILITA, fontSize: 26, lineHeight: 1 }}>Fantasy Footrace</div>
              <div style={{ fontFamily: SILK, fontSize: 11, letterSpacing: '.06em', color: '#5b5566' }}>{subtitle}</div>
            </div>
          </div>
          {headerExtra}
          <button onClick={toggleSound} {...press('sound')} style={{ fontFamily: SILK, fontSize: 11, fontWeight: 700, padding: '8px 12px', background: '#fffaf0', border: '2px solid #1c1a22', borderRadius: 8, boxShadow: '0 3px 0 #1c1a22', cursor: 'pointer', color: '#1c1a22', ...pressedStyle('sound', 2) }}>{sound ? 'SOUND: ON' : 'SOUND: OFF'}</button>
        </div>

        <div style={{ position: 'relative', background: '#d8d0bb', border: '3px solid #1c1a22', borderRadius: 18, boxShadow: '0 6px 0 #1c1a22', padding: 12 }}>
          <div style={{ position: 'relative', backgroundColor: '#253021', backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 1px,transparent 1px 3px)', border: '3px solid #1c1a22', borderRadius: 10, padding: '16px 18px', display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : '1fr auto 1fr', gap: 16, alignItems: 'center', color: '#cdef8a' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, background: '#4a82f0', border: '2px solid #cdef8a' }} />
                <div style={{ fontFamily: SILK, fontSize: 11, letterSpacing: '.08em' }}>{slate.me.owner}</div>
              </div>
              <div style={{ fontFamily: LILITA, fontSize: 19, lineHeight: 1.05, color: '#eaf7c8' }}>{slate.me.name}</div>
              <div style={{ fontFamily: SILK, fontSize: compact ? '40px' : '58px', lineHeight: 1, fontWeight: 700, color: '#eaf7c8' }}>{fmt(totals.me)}</div>
              <div style={{ fontFamily: SILK, fontSize: 11 }}>{`PROJ ${fmt(projected.me)}`}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, gridColumn: compact ? '1 / -1' : 'auto', order: compact ? 3 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: SILK, fontSize: 12, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
                <div style={{ width: 9, height: 9, background: final ? '#cdef8a' : isReplay ? '#ffd23f' : '#ff5a4a', animation: final ? 'none' : 'blink 1s steps(1) infinite' }} />
                <div>{final ? 'FINAL' : isReplay ? 'REPLAY' : 'LIVE'}</div>
              </div>
              <div style={{ fontFamily: SILK, fontSize: 28, fontWeight: 700, color: '#eaf7c8', lineHeight: 1, whiteSpace: 'nowrap' }}>{clock}</div>
              <div style={{ width: '100%', minWidth: 220, maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SILK, fontSize: 11, gap: 8, whiteSpace: 'nowrap' }}>
                  <div>{`${slate.me.owner} ${wp}%`}</div>
                  <div style={{ opacity: 0.8 }}>WIN PROB</div>
                  <div>{`${100 - wp}% ${slate.opp.owner}`}</div>
                </div>
                <div style={{ height: 18, border: '2px solid #cdef8a', display: 'flex', padding: 2, gap: 2 }}>
                  <div style={{ width: wp + '%', background: '#4a82f0', transition: 'width .6s steps(8)' }} />
                  <div style={{ flex: 1, background: '#e5583f' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', textAlign: 'right', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontFamily: SILK, fontSize: 11, letterSpacing: '.08em' }}>{slate.opp.owner}</div>
                <div style={{ width: 12, height: 12, background: '#e5583f', border: '2px solid #cdef8a' }} />
              </div>
              <div style={{ fontFamily: LILITA, fontSize: 19, lineHeight: 1.05, color: '#eaf7c8' }}>{slate.opp.name}</div>
              <div style={{ fontFamily: SILK, fontSize: compact ? '40px' : '58px', lineHeight: 1, fontWeight: 700, color: '#eaf7c8' }}>{fmt(totals.opp)}</div>
              <div style={{ fontFamily: SILK, fontSize: 11 }}>{`PROJ ${fmt(projected.opp)}`}</div>
            </div>
          </div>
          {bubbleEl(state.bubbles.me, 'me')}
          {bubbleEl(state.bubbles.opp, 'opp')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: SILK, fontSize: 11, letterSpacing: '.06em', color: '#5b5566', marginRight: 4 }}>TALK TRASH</div>
          {TAUNTS.map(text => (
            <button
              key={text}
              onClick={() => sendTaunt(text)}
              onMouseEnter={() => setHovered(text)}
              onMouseLeave={() => setHovered(null)}
              {...press(text)}
              style={{ fontFamily: LILITA, fontSize: 14, whiteSpace: 'nowrap', padding: '6px 12px', background: hovered === text ? '#ffd23f' : '#fffaf0', border: '2px solid #1c1a22', borderRadius: 999, boxShadow: '0 3px 0 #1c1a22', cursor: 'pointer', color: '#1c1a22', ...pressedStyle(text, 2) }}
            >
              {text}
            </button>
          ))}
          {liveNow ? (
            <>
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  const text = draft.trim();
                  setDraft('');
                  if (text) sendTaunt(text);
                }}
                placeholder="SAY SOMETHING"
                maxLength={24}
                disabled={!talk || !talk.connected}
                style={{ fontFamily: LILITA, fontSize: 14, width: 160, padding: '6px 12px', background: CREAM, border: '2px solid ' + INK, borderRadius: 999, color: INK }}
              />
              <div style={{ fontFamily: SILK, fontSize: 11, letterSpacing: '.06em', color: '#5b5566' }}>
                {talk && talk.connected
                  ? slate.opp.owner.includes(' & ')
                    ? talk.oppWatching ? `${slate.opp.owner} ARE WATCHING` : `${slate.opp.owner} AREN'T HERE`
                    : talk.oppWatching ? `${slate.opp.owner} IS WATCHING` : `${slate.opp.owner} ISN'T HERE`
                  : 'TALK OFFLINE'}
              </div>
            </>
          ) : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'minmax(0,1fr) 330px', gap: 16, alignItems: 'start' }}>
          <div style={{ position: 'relative', background: '#3e7a2d', border: '3px solid #1c1a22', borderRadius: 16, boxShadow: '0 6px 0 #1c1a22', padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 2px 2px' }}>
              <div style={{ fontFamily: LILITA, fontSize: 20, color: '#f3f7e6', whiteSpace: 'nowrap', flex: 'none' }}>The Race</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: SILK, fontSize: 10, color: '#e6f2cf', letterSpacing: '.05em', whiteSpace: 'nowrap', flexWrap: 'wrap' }}>
                <div>MIDFIELD = PROJECTION</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, background: '#4a82f0', border: '2px solid #1c1a22' }} />{slate.me.owner}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, background: '#e5583f', border: '2px solid #1c1a22' }} />{slate.opp.owner}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: compact ? '58px minmax(0,1fr)' : '176px minmax(0,1fr)', gap: 8 }}>
              <div />
              <div style={{ position: 'relative', height: 12, fontFamily: SILK, fontSize: 10, color: '#e6f2cf' }}>
                <div style={{ position: 'absolute', left: 0, whiteSpace: 'nowrap' }}>0</div>
                <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', color: '#ffd23f' }}>PROJ</div>
                <div style={{ position: 'absolute', right: 0, whiteSpace: 'nowrap' }}>2× PROJ</div>
              </div>
            </div>
            {lanes.map((ln, i) => (
              <div key={slate.lanes[i].me.id} style={{ display: 'grid', gridTemplateColumns: compact ? '58px minmax(0,1fr)' : '176px minmax(0,1fr)', gap: 8, alignItems: 'stretch', ...(bannerHost === i ? { position: 'relative', zIndex: 30 } as CSSProperties : null) }}>
                <div style={{ background: '#fffaf0', border: '2px solid #1c1a22', borderRadius: 10, padding: '7px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '2px 6px', flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: LILITA, fontSize: 17, lineHeight: 1, whiteSpace: 'nowrap' }}>{ln.slot}</div>
                    <div style={{ fontFamily: SILK, fontSize: 10, fontWeight: 700, color: ln.diffColor }}>{ln.diffL}</div>
                  </div>
                  {!compact ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '8px minmax(0,1fr) auto', gap: 5, alignItems: 'center', fontSize: 12, fontWeight: 800 }}>
                          <div style={{ width: 8, height: 8, background: '#4a82f0', border: '1.5px solid #1c1a22' }} />
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ln.me.name}</div>
                          <div style={{ fontFamily: SILK, fontSize: 11, fontWeight: 700 }}>{ln.me.ptsL}</div>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#6b6475', paddingLeft: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ln.me.sub}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '8px minmax(0,1fr) auto', gap: 5, alignItems: 'center', fontSize: 12, fontWeight: 800 }}>
                          <div style={{ width: 8, height: 8, background: '#e5583f', border: '1.5px solid #1c1a22' }} />
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ln.opp.name}</div>
                          <div style={{ fontFamily: SILK, fontSize: 11, fontWeight: 700 }}>{ln.opp.ptsL}</div>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#6b6475', paddingLeft: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ln.opp.sub}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div style={{ position: 'relative', height: 96, margin: '6px 0', border: '2px solid #1c1a22', borderRadius: 6, background: '#5fa844' }}>
                  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 4 }}>
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '600%', background: 'repeating-linear-gradient(90deg,rgba(255,255,255,.55) 0 2px,transparent 2px 1.6667%),repeating-linear-gradient(90deg,#63ad48 0 1.6667%,#59a13f 1.6667% 3.3333%)', transform: ln.stripeT, transition: ln.moveT }} />
                  </div>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', background: 'rgba(74,130,240,.3)', borderRadius: '4px 4px 0 0' }} />
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', background: 'rgba(229,88,63,.28)', borderTop: '2px dashed rgba(28,26,34,.35)', borderRadius: '0 0 4px 4px' }} />
                  <div style={{ position: 'absolute', left: ln.projLeft, opacity: ln.projOp, transition: ln.moveT, top: 0, bottom: 0, width: 4, marginLeft: -2, background: '#ffd23f', borderLeft: '1px solid #1c1a22', borderRight: '1px solid #1c1a22' }} />
                  <div style={{ position: 'absolute', left: ln.projLeft, opacity: ln.projOp, transition: ln.moveT, top: -9, transform: 'translateX(-50%)', fontFamily: SILK, fontSize: 9, fontWeight: 700, lineHeight: 1, padding: '1px 4px', background: '#1f3f86', color: '#fffaf0', border: '1.5px solid #1c1a22', borderRadius: 3, whiteSpace: 'nowrap', zIndex: 8, pointerEvents: 'none' }}>{ln.meProjL}</div>
                  <div style={{ position: 'absolute', left: ln.projLeft, opacity: ln.projOp, transition: ln.moveT, bottom: -9, transform: 'translateX(-50%)', fontFamily: SILK, fontSize: 9, fontWeight: 700, lineHeight: 1, padding: '1px 4px', background: '#8a2a1a', color: '#fffaf0', border: '1.5px solid #1c1a22', borderRadius: 3, whiteSpace: 'nowrap', zIndex: 8, pointerEvents: 'none' }}>{ln.oppProjL}</div>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%' }}>{ln.meAv}</div>
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%' }}>{ln.oppAv}</div>
                </div>
                {bannerHost === i ? bannerEl : null}
              </div>
            ))}
          </div>

          <div style={{ position: 'sticky', top: 14, background: '#fffaf0', border: '3px solid #1c1a22', borderRadius: 16, boxShadow: '0 6px 0 #1c1a22', display: 'flex', flexDirection: 'column', minWidth: 0, maxHeight: compact ? '380px' : 'calc(100vh - 150px)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '3px solid #1c1a22', background: '#ffd23f' }}>
              <div style={{ fontFamily: LILITA, fontSize: 19 }}>Play-by-Play</div>
              <div style={{ fontFamily: SILK, fontSize: 10, whiteSpace: 'nowrap' }}>{`${past.length} PLAYS`}</div>
            </div>
            <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {past.length === 0 ? (
                <div style={{ padding: '16px 14px', color: '#6b6475', fontSize: 13, fontWeight: 700 }}>Waiting on kickoff…</div>
              ) : null}
              {ticker.map(tk => (
                <div key={tk.id} style={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) auto', gap: 10, alignItems: 'start', padding: '10px 14px', borderBottom: '2px dashed #e0d8c4', background: tk.bg }}>
                  <div style={{ width: 10, height: 10, marginTop: 4, background: tk.sideColor, border: '2px solid #1c1a22' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.3, textWrap: 'pretty' }}>{tk.text}</div>
                    <div style={{ fontFamily: SILK, fontSize: 9, color: '#6b6475', letterSpacing: '.04em' }}>{tk.meta}</div>
                  </div>
                  <div style={{ fontFamily: SILK, fontSize: 12, fontWeight: 700, padding: '2px 6px', border: '2px solid #1c1a22', borderRadius: 6, background: tk.pillBg }}>{tk.ptsL}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '18px 14px 14px', background: 'linear-gradient(rgba(239,232,214,0),#efe8d6 40%)', zIndex: 40 }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', background: '#d8d0bb', border: '3px solid #1c1a22', borderRadius: 18, boxShadow: '0 5px 0 #1c1a22', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={togglePlaying} {...press('play')} style={{ width: 52, height: 52, borderRadius: '50%', background: '#e5583f', border: '3px solid #1c1a22', boxShadow: '0 4px 0 #1c1a22', fontFamily: SILK, fontWeight: 700, fontSize: 10, color: '#fffaf0', cursor: 'pointer', flex: 'none', padding: 0, ...pressedStyle('play', 3) }}>{finished ? 'AGAIN' : state.playing ? 'PAUSE' : 'PLAY'}</button>
          <button onClick={nextSpeed} {...press('speed')} style={{ height: 36, minWidth: 48, borderRadius: 999, background: '#4a82f0', border: '3px solid #1c1a22', boxShadow: '0 3px 0 #1c1a22', fontFamily: SILK, fontWeight: 700, fontSize: 12, color: '#fffaf0', cursor: 'pointer', flex: 'none', padding: '0 10px', ...pressedStyle('speed', 2) }}>{`x${speed}`}</button>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div
              ref={scrubRef}
              onPointerDown={scrubDown}
              onPointerMove={scrubMove}
              onPointerUp={scrubUp}
              onPointerCancel={scrubUp}
              style={{ position: 'relative', height: 22, border: '2px solid #1c1a22', borderRadius: 6, background: 'repeating-linear-gradient(135deg,#c9c0a8 0 5px,#bdb398 5px 10px)', cursor: 'pointer', touchAction: 'none' }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: liveT * 100 + '%', background: '#fffaf0', borderRadius: '4px 0 0 4px' }} />
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: t * 100 + '%', background: '#1c1a22', borderRadius: '4px 0 0 4px' }} />
              <div style={{ position: 'absolute', top: -6, left: t * 100 + '%', width: 14, height: 30, marginLeft: -7, background: '#ffd23f', border: '2px solid #1c1a22', borderRadius: 4, boxShadow: '0 2px 0 #1c1a22' }} />
            </div>
            <div style={{ position: 'relative', height: compact ? 20 : 11, fontFamily: SILK, fontSize: 9, color: '#5b5566', whiteSpace: 'nowrap' }}>
              {compact ? (
                <>
                  {slate.axis.filter(mark => mark.t < 1).map(mark => (
                    <div key={mark.label} data-axis-notch style={{ position: 'absolute', left: axisLeft(mark.t), width: 2, height: 6, top: 0, background: '#5b5566', transform: 'translateX(-50%)' }} />
                  ))}
                  <div data-axis-now style={axisNowStyle}>{clock}</div>
                </>
              ) : (
                slate.axis.map((mark, i) => (
                  <div key={mark.label} style={{ position: 'absolute', ...(i === 0 ? { left: 0 } : i === slate.axis.length - 1 ? { right: 0 } : { left: axisLeft(mark.t), transform: 'translateX(-50%)' }) }}>{mark.label}</div>
                ))
              )}
            </div>
          </div>
          <button onClick={jumpLive} {...press('live')} style={{ height: 36, borderRadius: 999, background: isReplay ? '#ff5a4a' : '#fffaf0', border: '3px solid #1c1a22', boxShadow: '0 3px 0 #1c1a22', fontFamily: SILK, fontWeight: 700, fontSize: 12, color: isReplay ? CREAM : INK, cursor: 'pointer', flex: 'none', padding: '0 12px', ...pressedStyle('live', 2) }}>LIVE</button>
        </div>
      </div>
    </div>
  );
}
