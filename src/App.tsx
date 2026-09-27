import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadLeagueInfo, loadLiveSlate, type LeagueInfo, type LiveSlate } from './espn/load';
import { mockSlate } from './sim/mock';
import { ConnectError, ModeSwitch, TeamPicker } from './ui/Connect';
import { MatchupPage } from './ui/MatchupPage';

type Mode = 'live' | 'demo';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function readMode(): Mode {
  try {
    return localStorage.getItem('ff_mode') === 'demo' ? 'demo' : 'live';
  } catch {
    return 'live';
  }
}

function readTeam(): number | null {
  try {
    const saved = localStorage.getItem('ff_team');
    const id = saved === null ? Number.NaN : Number(saved);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage stays optional: private mode or a blocked origin both throw
  }
}

function Loading(): JSX.Element {
  return (
    <div style={{ minHeight: '100vh', background: '#efe8d6', color: '#1c1a22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Silkscreen', monospace", fontSize: 13 }}>
      Loading league…
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>(readMode);
  const [attempt, setAttempt] = useState(0);
  const [info, setInfo] = useState<LeagueInfo | null>(null);
  const [team, setTeam] = useState<number | null>(readTeam);
  const [live, setLive] = useState<LiveSlate | null>(null);
  const [error, setError] = useState<unknown>(null);

  const demo = useMemo(() => mockSlate('Half PPR'), []);
  const liveRef = useRef<LiveSlate | null>(null);
  const picked = info && team !== null && info.teams.some(t => t.id === team) ? team : null;

  useEffect(() => {
    if (mode !== 'live') return;
    let ignore = false;
    setError(null);
    setInfo(null);
    setLive(null);
    liveRef.current = null;
    loadLeagueInfo()
      .then(next => {
        if (!ignore) setInfo(next);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught);
      });
    return () => {
      ignore = true;
    };
  }, [mode, attempt]);

  useEffect(() => {
    if (mode !== 'live' || !info || picked === null) return;
    let ignore = false;
    setError(null);
    setLive(null);
    liveRef.current = null;
    loadLiveSlate(info, picked, { timeZone: TZ })
      .then(next => {
        if (ignore) return;
        liveRef.current = next;
        setLive(next);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught);
      });
    return () => {
      ignore = true;
    };
  }, [mode, info, picked]);

  const liveNow = useCallback(() => (liveRef.current ? liveRef.current.toT(Date.now()) : 0), []);

  const changeMode = (next: Mode) => {
    store('ff_mode', next);
    setMode(next);
  };

  const pickTeam = (id: number) => {
    store('ff_team', String(id));
    setTeam(id);
  };

  const changeTeam = () => {
    store('ff_team', null);
    setTeam(null);
  };

  const switcher = (
    <ModeSwitch mode={mode} onMode={changeMode} onChangeTeam={mode === 'live' ? changeTeam : undefined} />
  );

  if (mode === 'demo') {
    return <MatchupPage key="demo" slate={demo} headerExtra={switcher} />;
  }

  if (error) {
    return <ConnectError error={error} onRetry={() => setAttempt(count => count + 1)} onDemo={() => changeMode('demo')} />;
  }

  if (!info) return <Loading />;

  if (picked === null) {
    return (
      <TeamPicker
        teams={info.teams}
        leagueName={info.name}
        onPick={pickTeam}
        onDemo={() => changeMode('demo')}
      />
    );
  }

  if (!live) return <Loading />;

  return (
    <MatchupPage
      key={`live-${picked}`}
      slate={live.slate}
      subtitle={`WEEK ${info.week} · ${info.name.toUpperCase()}`}
      headerExtra={switcher}
      liveNow={liveNow}
      storageKey="ff_live_v1"
    />
  );
}
