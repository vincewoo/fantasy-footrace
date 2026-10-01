import type { CSSProperties, ReactNode } from 'react';
import { fmt, snapshotAt, type Snapshot } from '../model/derive';
import type { Side, Slate } from '../model/types';
import type { WeekBoard, WeekMatchup } from '../espn/week';
import { matchupHref } from './route';

const INK = '#1c1a22';
const CREAM = '#fffaf0';
const ME = '#4a82f0';
const OPP = '#e5583f';
const ME_TXT = '#2f5fc4';
const OPP_TXT = '#c23e27';
const LCD = '#cdef8a';
const LCD_HI = '#eaf7c8';
const LILITA = "'Lilita One', sans-serif";
const SILK = "'Silkscreen', monospace";

const SIDE_COLOR: Record<Side, string> = { me: ME, opp: OPP };

const LCD_PANEL: CSSProperties = {
  backgroundColor: '#253021',
  backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 1px,transparent 1px 3px)',
  border: '2px solid ' + INK,
  borderRadius: 8,
  color: LCD,
};

export interface ScoreboardPageProps {
  board: WeekBoard;
  liveT: number;
  subtitle: string;
  headerExtra?: ReactNode;
  replay?: boolean;
}

export interface SideProgress {
  playing: number;
  left: number;
}

// How many of a side's starters are on the field right now, and how many have yet to finish.
// The timeline folds the gaps between game windows away, so a kickoff edge itself counts as not started yet.
export function progressOf(slate: Slate, side: Side, t: number): SideProgress {
  let playing = 0;
  let left = 0;
  for (const lane of slate.lanes) {
    const p = lane[side];
    if (p.id === 'empty' || t >= p.window[1]) continue;
    left += 1;
    if (t > p.window[0]) playing += 1;
  }
  return { playing, left };
}

function TeamRow(props: { slate: Slate; side: Side; total: number; projected: number; progress: SideProgress; leading: boolean }): JSX.Element {
  const { slate, side, progress } = props;
  const team = slate[side];
  const note = progress.playing
    ? `${progress.playing} PLAYING · ${progress.left} LEFT`
    : progress.left
      ? `${progress.left} LEFT`
      : 'DONE';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) auto', gap: 8, alignItems: 'center' }}>
      <div style={{ width: 10, height: 10, background: SIDE_COLOR[side], border: '1.5px solid ' + LCD }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ fontFamily: LILITA, fontSize: 15, lineHeight: 1.05, color: LCD_HI, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</div>
        <div style={{ fontFamily: SILK, fontSize: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {`${team.owner} · PROJ ${fmt(props.projected)} · `}
          <span style={{ color: progress.playing ? '#ffd23f' : LCD }}>{note}</span>
        </div>
      </div>
      <div style={{ fontFamily: SILK, fontSize: 24, lineHeight: 1, fontWeight: 700, color: props.leading ? LCD_HI : LCD, opacity: props.leading ? 1 : 0.75 }}>{fmt(props.total)}</div>
    </div>
  );
}

function MatchupTile(props: { matchup: WeekMatchup; snapshot: Snapshot; t: number; final: boolean }): JSX.Element {
  const { matchup, snapshot, t } = props;
  const { slate } = matchup;
  const { totals, projected, winPct: wp } = snapshot;
  const me = progressOf(slate, 'me', t);
  const opp = progressOf(slate, 'opp', t);
  const lead = totals.me - totals.opp;
  const tied = Math.abs(lead) < 0.05;
  const done = props.final || me.left + opp.left === 0;
  const status = done ? 'FINAL' : me.playing + opp.playing > 0 ? 'LIVE' : t > 0 ? 'BETWEEN GAMES' : 'UPCOMING';
  const leadL = tied
    ? 'TIED'
    : `${lead > 0 ? slate.me.owner : slate.opp.owner} ${done ? 'WINS' : 'BY'} ${done ? '' : fmt(Math.abs(lead))}`.trim();

  return (
    <a
      href={matchupHref(matchup.teamIds.me)}
      data-matchup-tile={matchup.id}
      aria-label={`${slate.me.name} vs ${slate.opp.name}: open the full matchup`}
      style={{ display: 'flex', flexDirection: 'column', minWidth: 0, color: INK, textDecoration: 'none', background: CREAM, border: '3px solid ' + INK, borderRadius: 14, boxShadow: '0 5px 0 ' + INK, overflow: 'hidden' }}
    >
      <div style={{ background: '#d8d0bb', borderBottom: '3px solid ' + INK, padding: 7 }}>
        <div style={{ ...LCD_PANEL, padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <TeamRow slate={slate} side="me" total={totals.me} projected={projected.me} progress={me} leading={lead >= 0} />
          <div style={{ height: 8, border: '1.5px solid ' + LCD, display: 'flex', padding: 1, gap: 1 }}>
            <div style={{ width: wp + '%', background: ME, transition: 'width .6s steps(8)' }} />
            <div style={{ flex: 1, background: OPP }} />
          </div>
          <TeamRow slate={slate} side="opp" total={totals.opp} projected={projected.opp} progress={opp} leading={lead <= 0} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', fontFamily: SILK, fontSize: 9, color: '#5b5566' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          {status === 'LIVE' ? <div style={{ width: 7, height: 7, background: '#ff5a4a', animation: 'blink 1s steps(1) infinite' }} /> : null}
          <div>{status}</div>
          <div style={{ fontWeight: 700, color: tied ? '#5b5566' : lead > 0 ? ME_TXT : OPP_TXT }}>{`· ${leadL}`}</div>
        </div>
        <div style={{ fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{'MATCHUP ›'}</div>
      </div>
    </a>
  );
}

export function ScoreboardPage({ board, liveT, subtitle, headerExtra, replay = false }: ScoreboardPageProps): JSX.Element {
  const t = replay ? 1 : liveT;
  const final = replay || t >= 1;
  const tiles = board.matchups.map(matchup => ({ matchup, snapshot: snapshotAt(matchup.slate, t) }));
  const playing = board.matchups.reduce((n, m) => n + progressOf(m.slate, 'me', t).playing + progressOf(m.slate, 'opp', t).playing, 0);
  const live = !final && playing > 0;
  const modeLabel = final ? 'FINAL' : live ? 'LIVE' : t > 0 ? 'BETWEEN GAMES' : 'UPCOMING';
  const modeDot = final ? LCD : live ? '#ff5a4a' : '#ffd23f';

  return (
    <div style={{ minHeight: '100vh', background: '#efe8d6', color: INK, fontFamily: "'Nunito', sans-serif", padding: '16px 14px 40px' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.svg" width={40} height={46} alt="Gridiron Gang" style={{ display: 'block', flex: 'none', filter: 'drop-shadow(0 3px 0 #1c1a22)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontFamily: LILITA, fontSize: 26, lineHeight: 1, whiteSpace: 'nowrap' }}>Scoreboard</div>
              <div style={{ fontFamily: SILK, fontSize: 11, letterSpacing: '.06em', color: '#5b5566' }}>{subtitle}</div>
            </div>
          </div>
          {headerExtra}
        </div>

        <div style={{ background: '#d8d0bb', border: '3px solid ' + INK, borderRadius: 14, boxShadow: '0 4px 0 ' + INK, padding: 7 }}>
          <div style={{ ...LCD_PANEL, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontFamily: SILK, fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <div style={{ width: 8, height: 8, background: modeDot, animation: live ? 'blink 1s steps(1) infinite' : 'none' }} />
              {modeLabel}
            </div>
            <div style={{ whiteSpace: 'nowrap' }}>{live ? `${playing} PLAYERS ON THE FIELD` : 'PICK A MATCHUP TO WATCH IT'}</div>
            <div style={{ whiteSpace: 'nowrap' }}>{`${board.matchups.length} MATCHUPS`}</div>
          </div>
        </div>

        {tiles.length === 0 ? (
          <div data-scoreboard-empty style={{ padding: 18, background: CREAM, border: '3px solid ' + INK, borderRadius: 14, fontWeight: 800 }}>No matchups this week.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
            {tiles.map(tile => (
              <MatchupTile key={tile.matchup.id} matchup={tile.matchup} snapshot={tile.snapshot} t={t} final={final} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
