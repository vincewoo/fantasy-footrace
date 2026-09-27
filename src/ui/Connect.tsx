import { useState, type CSSProperties, type ReactNode } from 'react';
import { EspnError, saveKey } from '../espn/client';
import type { LeagueTeam } from '../espn/slate';

const INK = '#1c1a22';
const CREAM = '#fffaf0';
const LILITA = "'Lilita One', sans-serif";
const SILK = "'Silkscreen', monospace";

const PAGE: CSSProperties = {
  minHeight: '100vh',
  background: '#efe8d6',
  color: INK,
  fontFamily: "'Nunito', sans-serif",
  padding: '40px 14px',
};

const CARD: CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  background: CREAM,
  border: '3px solid ' + INK,
  borderRadius: 16,
  boxShadow: '0 6px 0 ' + INK,
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const TITLE: CSSProperties = { fontFamily: LILITA, fontSize: 26, lineHeight: 1 };

const SUBTITLE: CSSProperties = { fontFamily: SILK, fontSize: 11, letterSpacing: '.06em', color: '#5b5566' };

const PILL: CSSProperties = {
  fontFamily: LILITA,
  fontSize: 14,
  whiteSpace: 'nowrap',
  padding: '6px 12px',
  background: CREAM,
  border: '2px solid ' + INK,
  borderRadius: 999,
  boxShadow: '0 3px 0 ' + INK,
  cursor: 'pointer',
  color: INK,
};

const INPUT: CSSProperties = {
  fontFamily: SILK,
  fontSize: 11,
  padding: '8px 12px',
  background: CREAM,
  border: '2px solid ' + INK,
  borderRadius: 999,
  color: INK,
  minWidth: 160,
};

function button(on: boolean, extra?: CSSProperties): CSSProperties {
  return {
    fontFamily: SILK,
    fontSize: 11,
    fontWeight: 700,
    padding: '8px 12px',
    background: on ? INK : CREAM,
    border: '2px solid ' + INK,
    borderRadius: 999,
    boxShadow: '0 3px 0 ' + INK,
    cursor: 'pointer',
    color: on ? CREAM : INK,
    ...extra,
  };
}

function Card({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={PAGE}>
      <div style={CARD}>{children}</div>
    </div>
  );
}

export function TeamPicker(props: {
  teams: LeagueTeam[];
  leagueName: string;
  onPick(id: number): void;
  onDemo(): void;
}): JSX.Element {
  return (
    <Card>
      <div style={TITLE}>Pick your team</div>
      <div style={SUBTITLE}>{props.leagueName}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {props.teams.map(team => (
          <button key={team.id} onClick={() => props.onPick(team.id)} style={PILL}>
            {team.owner ? `${team.name} · ${team.owner}` : team.name}
          </button>
        ))}
      </div>
      <button onClick={props.onDemo} style={{ ...PILL, alignSelf: 'flex-start', background: '#ffd23f' }}>
        Just watch the demo
      </button>
    </Card>
  );
}

function problem(error: unknown): string {
  const espn = error instanceof EspnError ? error : null;
  if (espn?.kind === 'private') {
    return "ESPN says this league is private. The proxy isn't sending your cookies - check ESPN_S2 and SWID in .env.local and restart pnpm dev.";
  }
  if (espn?.kind === 'key') return 'This app needs the league passphrase.';
  if (espn?.kind === 'network') return "Can't reach the ESPN proxy.";
  if (!espn) return `Couldn't read the league data: ${error instanceof Error ? error.message : String(error)}`;
  return `ESPN returned an error (${espn.status}).`;
}

export function ConnectError(props: { error: unknown; onRetry(): void; onDemo(): void }): JSX.Element {
  const [key, setKey] = useState('');
  const wantsKey = props.error instanceof EspnError && props.error.kind === 'key';

  return (
    <Card>
      <div style={TITLE}>Can't load your league</div>
      <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.4 }}>{problem(props.error)}</div>
      {wantsKey ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="password"
            value={key}
            onChange={event => setKey(event.target.value)}
            placeholder="League passphrase"
            aria-label="League passphrase"
            style={INPUT}
          />
          <button
            onClick={() => {
              saveKey(key.trim());
              props.onRetry();
            }}
            style={PILL}
          >
            Unlock
          </button>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={props.onRetry} style={PILL}>Retry</button>
        <button onClick={props.onDemo} style={PILL}>Use demo</button>
      </div>
    </Card>
  );
}

export function ModeSwitch(props: {
  mode: 'live' | 'demo';
  onMode(m: 'live' | 'demo'): void;
  onChangeTeam?: () => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => props.onMode('live')} style={button(props.mode === 'live')}>LIVE</button>
      <button onClick={() => props.onMode('demo')} style={button(props.mode === 'demo')}>DEMO</button>
      {props.onChangeTeam ? (
        <button onClick={props.onChangeTeam} style={button(false)}>CHANGE TEAM</button>
      ) : null}
    </div>
  );
}
