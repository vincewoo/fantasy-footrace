import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { espnBase, savedKey } from './espn/client';
import { loadLeagueInfo, loadLiveSlate, pollLive, type LeagueInfo, type LiveSlate } from './espn/load';
import { timeLabel } from './espn/timeline';
import { mockSlate } from './sim/mock';
import { connectTalk, talkUrl, type TalkConnection } from './talk/socket';
import { ConnectError, ModeSwitch, TeamPicker } from './ui/Connect';
import { MatchupPage } from './ui/MatchupPage';

type Mode = 'live' | 'demo';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const POLL_MS = 15000;

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
  const [room, setRoom] = useState(false);
  const [connected, setConnected] = useState(false);
  const [oppWatching, setOppWatching] = useState(false);
  const [remoteTaunt, setRemoteTaunt] = useState<{ id: number; text: string } | null>(null);

  const demo = useMemo(() => mockSlate('Half PPR'), []);
  const liveRef = useRef<LiveSlate | null>(null);
  const pollingRef = useRef(false);
  const talkRef = useRef<TalkConnection | null>(null);
  const tauntRef = useRef(0);
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
    pollingRef.current = false;
    setRoom(false);
    setConnected(false);
    setOppWatching(false);
    setRemoteTaunt(null);
    loadLiveSlate(info, picked, { timeZone: TZ })
      .then(next => {
        if (ignore) return;
        liveRef.current = next;
        setLive(next);

        const url = talkUrl(espnBase(), {
          season: next.season,
          week: next.week,
          matchupId: next.matchupId,
          team: next.myTeamId,
        });
        const key = savedKey();
        if (url === null || key === null) return;

        talkRef.current = connectTalk(url, key, {
          onTaunt: (teamId, text) => {
            if (teamId !== next.oppTeamId) return;
            tauntRef.current += 1;
            setRemoteTaunt({ id: tauntRef.current, text });
          },
          onPresence: teams => setOppWatching(teams.includes(next.oppTeamId)),
          onStatus: setConnected,
        });
        setRoom(true);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught);
      });
    return () => {
      ignore = true;
      talkRef.current?.close();
      talkRef.current = null;
    };
  }, [mode, info, picked]);

  useEffect(() => {
    if (mode !== 'live' || !info || picked === null) return;
    let ignore = false;

    const pollOne = () => {
      const current = liveRef.current;
      if (!current || pollingRef.current) return;

      const tNow = current.toT(Date.now());
      const inGame = current.slate.lanes.some(lane =>
        (['me', 'opp'] as const).some(side => {
          const p = lane[side];
          return p.id !== 'empty' && p.window[0] < tNow && tNow < p.window[1];
        }),
      );
      if (!inGame) return;

      pollingRef.current = true;
      pollLive(info, current)
        .then(next => {
          if (ignore) return;
          liveRef.current = next;
          setLive(next);
        })
        .catch(() => {
          // a failed poll keeps the current slate and is retried on the next tick
        })
        .finally(() => {
          pollingRef.current = false;
        });
    };

    const timer = setInterval(pollOne, POLL_MS);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [mode, info, picked]);

  const liveNow = useCallback(() => (liveRef.current ? liveRef.current.toT(Date.now()) : 0), []);
  const liveClock = useCallback(() => timeLabel(Date.now(), TZ, true), []);
  const sendTaunt = useCallback((text: string) => talkRef.current?.send(text) ?? false, []);
  const talk = room ? { send: sendTaunt, connected, oppWatching } : null;

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
      liveClock={liveClock}
      storageKey="ff_live_v1"
      talk={talk}
      remoteTaunt={remoteTaunt}
    />
  );
}
