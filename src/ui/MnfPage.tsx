import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { fmt, sgn, snapshotAt, type Snapshot } from '../model/derive';
import type { Player, Side, Slate } from '../model/types';
import type { MnfBoard, MnfGame, MnfMatchup } from '../espn/mnf';
import { gameLabel, withGameStatus, type GameStatus } from '../espn/scoreboard';
import { timeLabel } from '../espn/timeline';
import { skinOf } from './Avatar';
import { DEFAULT_HAIR, Head } from './Head';
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
const SIDE_TXT: Record<Side, string> = { me: ME_TXT, opp: OPP_TXT };

const LCD_PANEL: CSSProperties = {
  backgroundColor: '#253021',
  backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 1px,transparent 1px 3px)',
  border: '2px solid ' + INK,
  borderRadius: 8,
  color: LCD,
};

export interface MnfPageProps {
  board: MnfBoard;
  statuses: Record<string, GameStatus>;
  liveT: number;
  timeZone: string;
  subtitle: string;
  headerExtra?: ReactNode;
  replay?: boolean;
}

interface Pop {
  id: number;
  pts: number;
}

export function popKey(matchup: number, side: Side, player: string): string {
  return `${matchup}${side}${player}`;
}

// What an MNF player still projects to add: the unplayed share of their projection, nothing once ruled out.
function remaining(p: Player, t: number, out: boolean): number {
  if (out) return 0;
  const [a, b] = p.window;
  const f = b > a ? Math.max(0, Math.min(1, (t - a) / (b - a))) : t >= a ? 1 : 0;
  return p.proj * (1 - f);
}

function gameStatus(game: MnfGame, statuses: Record<string, GameStatus>, timeZone: string, final: boolean): string {
  const status = statuses[game.home] ?? statuses[game.away];
  const label = status ? gameLabel(status) : null;
  if (label !== null) return label;
  return final ? 'FINAL' : 'KO ' + timeLabel(game.date, timeZone, true);
}

function HeadIcon({ player, colors }: { player: Player; colors: Slate['teamColors'][string] }): JSX.Element {
  return (
    <svg viewBox="-17 -19 34 34" width={30} height={30} style={{ display: 'block', flex: 'none', overflow: 'visible' }} aria-hidden="true">
      <Head
        hair={player.hair}
        hc={player.hc ?? DEFAULT_HAIR}
        skin={skinOf(player)}
        beard={player.beard ?? 'none'}
        band={player.band}
        mood="norm"
        colors={colors ?? { c1: '#6b6475', c2: CREAM }}
      />
    </svg>
  );
}

function PlayerRow(props: {
  slate: Slate;
  side: Side;
  lane: number;
  snapshot: Snapshot;
  t: number;
  pop: Pop | undefined;
}): JSX.Element {
  const { slate, side, lane, snapshot, t, pop } = props;
  const p = slate.lanes[lane][side];
  const out = snapshot.out.has(`${side}${lane}`);
  const pts = snapshot.laneTotals[lane][side];
  const status = out ? 'OUT' : slate.statusLabel(p, t);
  const fill = p.proj > 0 ? Math.max(0, Math.min(1, pts / (p.proj * 2))) : pts > 0 ? 1 : 0;

  return (
    <div data-mnf-player style={{ display: 'grid', gridTemplateColumns: '6px 30px minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: '6px 10px', borderTop: '2px dashed #e0d8c4', opacity: out ? 0.55 : 1 }}>
      <div style={{ alignSelf: 'stretch', background: SIDE_COLOR[side], border: '1.5px solid ' + INK, borderRadius: 2 }} />
      <HeadIcon player={p} colors={slate.teamColors[p.team]} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <div style={{ fontFamily: SILK, fontSize: 9, fontWeight: 700, color: SIDE_TXT[side], flex: 'none' }}>{slate.lanes[lane].slot}</div>
          <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#6b6475', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${p.team} · ${status} · proj ${fmt(p.proj)}`}</div>
        <div style={{ height: 6, border: '1.5px solid ' + INK, borderRadius: 3, background: '#e0d8c4', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (fill * 100).toFixed(1) + '%', background: SIDE_COLOR[side], transition: 'width .6s steps(8)' }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, background: '#ffd23f' }} />
        </div>
      </div>
      <div style={{ position: 'relative', fontFamily: SILK, fontSize: 16, fontWeight: 700, minWidth: 44, textAlign: 'right' }}>
        {fmt(pts)}
        {pop ? (
          <div key={pop.id} data-mnf-pop style={{ position: 'absolute', right: 0, top: -14, fontSize: 11, padding: '1px 4px', background: pop.pts < 0 ? '#ff8a73' : '#b8f06a', border: '2px solid ' + INK, borderRadius: 4, opacity: 0, animation: 'pop 2.4s steps(24) forwards', pointerEvents: 'none', whiteSpace: 'nowrap' }}>{sgn(pop.pts)}</div>
        ) : null}
      </div>
    </div>
  );
}

function TeamScore(props: { slate: Slate; side: Side; total: number; projected: number; left: number; count: number }): JSX.Element {
  const { slate, side } = props;
  const team = slate[side];
  const right = side === 'opp';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, alignItems: right ? 'flex-end' : 'flex-start', textAlign: right ? 'right' : 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: SILK, fontSize: 9, flexDirection: right ? 'row-reverse' : 'row', maxWidth: '100%' }}>
        <div style={{ width: 8, height: 8, flex: 'none', background: SIDE_COLOR[side], border: '1.5px solid ' + LCD }} />
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.owner}</div>
      </div>
      <div style={{ fontFamily: LILITA, fontSize: 14, lineHeight: 1.05, color: LCD_HI, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</div>
      <div style={{ fontFamily: SILK, fontSize: 28, lineHeight: 1, fontWeight: 700, color: LCD_HI }}>{fmt(props.total)}</div>
      <div style={{ fontFamily: SILK, fontSize: 8, whiteSpace: 'nowrap' }}>{`PROJ ${fmt(props.projected)}`}</div>
      <div style={{ fontFamily: SILK, fontSize: 8, whiteSpace: 'nowrap', color: props.count ? '#ffd23f' : LCD }}>
        {props.count ? `${props.count} MNF · ${fmt(props.left)} LEFT` : 'NO MNF'}
      </div>
    </div>
  );
}

function MatchupCard(props: { matchup: MnfMatchup; slate: Slate; snapshot: Snapshot; t: number; pops: Record<string, Pop> }): JSX.Element {
  const { matchup, slate, snapshot, t } = props;
  const { totals, projected, winPct: wp } = snapshot;
  const left = (side: Side) =>
    matchup.players[side].reduce((sum, e) => sum + remaining(slate.lanes[e.lane][side], t, snapshot.out.has(`${side}${e.lane}`)), 0);
  const lead = totals.me - totals.opp;
  const leadL = Math.abs(lead) < 0.05
    ? 'TIED'
    : `${lead > 0 ? slate.me.owner : slate.opp.owner} BY ${fmt(Math.abs(lead))}`;
  const rows = [...matchup.players.me, ...matchup.players.opp];

  return (
    <a
      href={matchupHref(matchup.teamIds.me)}
      data-mnf-matchup={matchup.id}
      aria-label={`${slate.me.name} vs ${slate.opp.name}: open the full matchup`}
      style={{ color: INK, textDecoration: 'none', background: CREAM, border: '3px solid ' + INK, borderRadius: 14, boxShadow: '0 5px 0 ' + INK, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}
    >
      <div style={{ background: '#d8d0bb', borderBottom: '3px solid ' + INK, padding: 7 }}>
        <div style={{ ...LCD_PANEL, padding: '8px 10px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 8, alignItems: 'center' }}>
          <TeamScore slate={slate} side="me" total={totals.me} projected={projected.me} left={left('me')} count={matchup.players.me.length} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 64 }}>
            <div style={{ fontFamily: SILK, fontSize: 8, whiteSpace: 'nowrap', opacity: 0.8 }}>WIN %</div>
            <div style={{ width: '100%', height: 10, border: '1.5px solid ' + LCD, display: 'flex', padding: 1, gap: 1 }}>
              <div style={{ width: wp + '%', background: ME, transition: 'width .6s steps(8)' }} />
              <div style={{ flex: 1, background: OPP }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontFamily: SILK, fontSize: 8 }}>
              <div>{wp}</div><div>{100 - wp}</div>
            </div>
          </div>
          <TeamScore slate={slate} side="opp" total={totals.opp} projected={projected.opp} left={left('opp')} count={matchup.players.opp.length} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', fontFamily: SILK, fontSize: 9, color: '#5b5566' }}>
        <div style={{ fontWeight: 700, color: Math.abs(lead) < 0.05 ? '#5b5566' : lead > 0 ? ME_TXT : OPP_TXT, whiteSpace: 'nowrap' }}>{leadL}</div>
        <div style={{ fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{'FULL MATCHUP \u203a'}</div>
      </div>
      {rows.map(e => {
        const p = slate.lanes[e.lane][e.side];
        return (
          <PlayerRow
            key={e.side + p.id}
            slate={slate}
            side={e.side}
            lane={e.lane}
            snapshot={snapshot}
            t={t}
            pop={props.pops[popKey(matchup.id, e.side, p.id)]}
          />
        );
      })}
    </a>
  );
}

export function MnfPage({ board, statuses, liveT, timeZone, subtitle, headerExtra, replay = false }: MnfPageProps): JSX.Element {
  const t = replay ? 1 : liveT;
  const [pops, setPops] = useState<Record<string, Pop>>({});
  const lastRef = useRef<Record<string, number> | null>(null);
  const popIdRef = useRef(0);

  const cards = board.matchups.map(matchup => {
    const slate = replay ? matchup.slate : withGameStatus(matchup.slate, statuses, t);
    return { matchup, slate, snapshot: snapshotAt(slate, t) };
  });

  // A player whose points moved since the last poll gets a +/- pop; the first load only records.
  useEffect(() => {
    const next: Record<string, number> = {};
    const fresh: Record<string, Pop> = {};
    for (const { matchup, snapshot } of cards) {
      for (const side of ['me', 'opp'] as const) {
        for (const e of matchup.players[side]) {
          const key = popKey(matchup.id, side, matchup.slate.lanes[e.lane][side].id);
          const pts = snapshot.laneTotals[e.lane][side];
          next[key] = pts;
          const prev = lastRef.current?.[key];
          if (prev !== undefined && Math.abs(pts - prev) >= 0.05) fresh[key] = { id: ++popIdRef.current, pts: pts - prev };
        }
      }
    }
    lastRef.current = next;
    if (Object.keys(fresh).length) setPops(cur => ({ ...cur, ...fresh }));
  }, [board]);

  // The closest races lead, since those are the ones Monday night decides.
  const sorted = [...cards].sort((a, b) => Math.abs(a.snapshot.winPct - 50) - Math.abs(b.snapshot.winPct - 50));

  const final = t >= board.window[1];
  const live = !replay && !final && t >= board.window[0];
  const modeLabel = replay || final ? 'FINAL' : live ? 'LIVE' : 'UPCOMING';
  const modeDot = replay || final ? LCD : live ? '#ff5a4a' : '#ffd23f';
  const mnfPlayers = board.matchups.reduce((n, m) => n + m.players.me.length + m.players.opp.length, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#efe8d6', color: INK, fontFamily: "'Nunito', sans-serif", padding: '16px 14px 40px' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.svg" width={40} height={46} alt="Gridiron Gang" style={{ display: 'block', flex: 'none', filter: 'drop-shadow(0 3px 0 #1c1a22)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontFamily: LILITA, fontSize: 26, lineHeight: 1, whiteSpace: 'nowrap' }}>Monday Night</div>
              <div style={{ fontFamily: SILK, fontSize: 11, letterSpacing: '.06em', color: '#5b5566' }}>{subtitle}</div>
            </div>
          </div>
          {headerExtra}
        </div>

        <div style={{ background: '#d8d0bb', border: '3px solid ' + INK, borderRadius: 14, boxShadow: '0 4px 0 ' + INK, padding: 7 }}>
          <div style={{ ...LCD_PANEL, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: SILK, fontSize: 11, whiteSpace: 'nowrap' }}>
              <div style={{ width: 8, height: 8, background: modeDot, animation: live ? 'blink 1s steps(1) infinite' : 'none' }} />
              {modeLabel}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {board.games.map(game => (
                <div key={game.id} data-mnf-game style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
                  <div style={{ fontFamily: SILK, fontSize: 18, fontWeight: 700, color: LCD_HI }}>{`${game.away} @ ${game.home}`}</div>
                  <div style={{ fontFamily: SILK, fontSize: 11 }}>{gameStatus(game, replay ? {} : statuses, timeZone, replay || final)}</div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: SILK, fontSize: 10, whiteSpace: 'nowrap' }}>{`${board.matchups.length} MATCHUPS · ${mnfPlayers} PLAYERS`}</div>
          </div>
        </div>

        {board.games.length === 0 ? (
          <div data-mnf-empty style={{ padding: 18, background: CREAM, border: '3px solid ' + INK, borderRadius: 14, fontWeight: 800 }}>No Monday night games this week.</div>
        ) : sorted.length === 0 ? (
          <div data-mnf-empty style={{ padding: 18, background: CREAM, border: '3px solid ' + INK, borderRadius: 14, fontWeight: 800 }}>Nobody in the league is starting a Monday night player.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
            {sorted.map(card => (
              <MatchupCard key={card.matchup.id} matchup={card.matchup} slate={card.slate} snapshot={card.snapshot} t={t} pops={pops} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
