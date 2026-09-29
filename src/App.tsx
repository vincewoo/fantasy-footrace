import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { espnBase, savedKey } from './espn/client';
import { loadLeagueInfo, loadLiveSlate, pollLive, type LeagueInfo, type LiveSlate } from './espn/load';
import { loadMnfBoard, pollMnf, type MnfBoard } from './espn/mnf';
import { fetchScoreboard, statusesByTeam, withGameStatus, type GameStatus } from './espn/scoreboard';
import { timeLabel } from './espn/timeline';
import { connectTalk, talkUrl, type TalkConnection } from './talk/socket';
import { ConnectError, HeaderControls, TeamPicker } from './ui/Connect';
import { MatchupPage } from './ui/MatchupPage';
import { MnfPage } from './ui/MnfPage';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const POLL_MS = 15000;

const WEEK_CHECK_MS = 10 * 60 * 1000;

function readTeam(): number | null {
  try {
    const saved = localStorage.getItem('ff_team');
    const id = saved === null ? Number.NaN : Number(saved);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

const MNF_HASH = '#mnf';

function readMnf(): boolean {
  return typeof location !== 'undefined' && location.hash === MNF_HASH;
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
  const [attempt, setAttempt] = useState(0);
  const [info, setInfo] = useState<LeagueInfo | null>(null);
  const [team, setTeam] = useState<number | null>(readTeam);
  const [replayWeek, setReplayWeek] = useState<number | null>(null);
  const [live, setLive] = useState<LiveSlate | null>(null);
  const [statuses, setStatuses] = useState<Record<string, GameStatus>>({});
  const [error, setError] = useState<unknown>(null);
  const [room, setRoom] = useState(false);
  const [connected, setConnected] = useState(false);
  const [oppWatching, setOppWatching] = useState(false);
  const [remoteTaunt, setRemoteTaunt] = useState<{ id: number; text: string } | null>(null);
  const [mnf, setMnf] = useState(readMnf);
  const [board, setBoard] = useState<MnfBoard | null>(null);
  const [mnfStatuses, setMnfStatuses] = useState<Record<string, GameStatus>>({});

  const liveRef = useRef<LiveSlate | null>(null);
  const pollingRef = useRef(false);
  const talkRef = useRef<TalkConnection | null>(null);
  const tauntRef = useRef(0);
  const boardRef = useRef<MnfBoard | null>(null);
  const mnfPollingRef = useRef(false);
  const infoRef = useRef<LeagueInfo | null>(null);
  infoRef.current = info;
  const picked = info && team !== null && info.teams.some(t => t.id === team) ? team : null;
  const week = info ? (replayWeek !== null && replayWeek < info.week ? replayWeek : info.week) : null;
  const replay = info !== null && week !== info.week;

  useEffect(() => {
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
  }, [attempt]);

  useEffect(() => {
    if (!info) return;
    let ignore = false;

    const check = () => {
      loadLeagueInfo()
        .then(next => {
          if (!ignore && next.week !== info.week) setInfo(next);
        })
        .catch(() => {
          // a failed check keeps the current week and is retried on the next one
        });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    const timer = setInterval(check, WEEK_CHECK_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      ignore = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [info]);

  useEffect(() => {
    const info = infoRef.current;
    if (!info || picked === null || week === null || mnf) return;
    let ignore = false;
    setError(null);
    setLive(null);
    liveRef.current = null;
    pollingRef.current = false;
    setStatuses({});
    setRoom(false);
    setConnected(false);
    setOppWatching(false);
    setRemoteTaunt(null);
    loadLiveSlate(info, picked, { timeZone: TZ, week })
      .then(next => {
        if (ignore) return;
        liveRef.current = next;
        setLive(next);
        if (replay) return;

        fetchScoreboard(next.season, next.week)
          .then(board => {
            if (!ignore) setStatuses(statusesByTeam(board));
          })
          .catch(() => {
            // the timeline labels stand in until a scoreboard read succeeds
          });

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
  }, [week, picked, replay, mnf]);

  useEffect(() => {
    if (!info || picked === null || replay || mnf) return;
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
      const matchup = pollLive(info, current)
        .then(next => {
          if (ignore) return;
          liveRef.current = next;
          setLive(next);
        })
        .catch(() => {
          // a failed poll keeps the current slate and is retried on the next tick
        });

      const board = fetchScoreboard(current.season, current.week)
        .then(scoreboard => {
          if (!ignore) setStatuses(statusesByTeam(scoreboard));
        })
        .catch(() => {
          // a failed scoreboard read keeps the previous statuses
        });

      Promise.all([matchup, board]).finally(() => {
        pollingRef.current = false;
      });
    };

    const timer = setInterval(pollOne, POLL_MS);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [info, picked, replay, mnf]);

  useEffect(() => {
    const onHash = () => setMnf(readMnf());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const info = infoRef.current;
    if (!info || week === null || !mnf) return;
    let ignore = false;
    setError(null);
    setBoard(null);
    boardRef.current = null;
    mnfPollingRef.current = false;
    setMnfStatuses({});
    loadMnfBoard(info, { timeZone: TZ, week, myTeamId: picked })
      .then(next => {
        if (ignore) return;
        boardRef.current = next;
        setBoard(next);
        if (replay) return;
        fetchScoreboard(next.season, next.week)
          .then(scoreboard => {
            if (!ignore) setMnfStatuses(statusesByTeam(scoreboard));
          })
          .catch(() => {
            // kickoff times stand in until a scoreboard read succeeds
          });
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught);
      });
    return () => {
      ignore = true;
    };
  }, [week, picked, replay, mnf]);

  useEffect(() => {
    if (!info || !mnf || replay) return;
    let ignore = false;

    const pollOne = () => {
      const current = boardRef.current;
      if (!current || mnfPollingRef.current || current.matchups.length === 0) return;
      const tNow = current.toT(Date.now());
      if (tNow < current.window[0] || tNow >= current.window[1]) return;

      mnfPollingRef.current = true;
      const matchups = pollMnf(info, current, { timeZone: TZ, myTeamId: picked })
        .then(next => {
          if (ignore) return;
          boardRef.current = next;
          setBoard(next);
        })
        .catch(() => {
          // a failed poll keeps the current board and is retried on the next tick
        });
      const scoreboard = fetchScoreboard(current.season, current.week)
        .then(next => {
          if (!ignore) setMnfStatuses(statusesByTeam(next));
        })
        .catch(() => {
          // a failed scoreboard read keeps the previous statuses
        });
      Promise.all([matchups, scoreboard]).finally(() => {
        mnfPollingRef.current = false;
      });
    };

    const timer = setInterval(pollOne, POLL_MS);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [info, picked, replay, mnf]);

  const liveNow = useCallback(() => (liveRef.current ? liveRef.current.toT(Date.now()) : 0), []);
  const liveClock = useCallback(() => timeLabel(Date.now(), TZ, true), []);
  const gameSlate = useMemo(
    () => (live ? withGameStatus(live.slate, statuses, live.toT(Date.now())) : null),
    [live?.slate, statuses],
  );
  const sendTaunt = useCallback((text: string) => talkRef.current?.send(text) ?? false, []);
  const talk = room ? { send: sendTaunt, connected, oppWatching } : null;

  const pickTeam = (id: number) => {
    store('ff_team', String(id));
    setTeam(id);
  };

  const showMnf = (on: boolean) => {
    try {
      history.replaceState(null, '', on ? MNF_HASH : location.pathname + location.search);
    } catch {
      // the view still switches when the URL can't be rewritten
    }
    setMnf(on);
  };

  const changeTeam = () => {
    store('ff_team', null);
    setTeam(null);
    setReplayWeek(null);
  };

  if (error) {
    return (
      <ConnectError
        error={error}
        onRetry={() => {
          setReplayWeek(null);
          setAttempt(count => count + 1);
        }}
      />
    );
  }

  if (!info) return <Loading />;

  if (mnf && week !== null) {
    if (!board || board.week !== week) return <Loading />;
    return (
      <MnfPage
        key={`mnf-${week}`}
        board={board}
        statuses={mnfStatuses}
        liveT={board.toT(Date.now())}
        timeZone={TZ}
        subtitle={`WEEK ${week}${replay ? ' REPLAY' : ''} · ${info.name.toUpperCase()}`}
        headerExtra={
          <HeaderControls
            week={week}
            currentWeek={info.week}
            onWeek={next => setReplayWeek(next === info.week ? null : next)}
            onChangeTeam={picked === null ? undefined : changeTeam}
            mnf
            onMnf={showMnf}
          />
        }
        replay={replay}
      />
    );
  }

  if (picked === null) {
    return <TeamPicker teams={info.teams} leagueName={info.name} onPick={pickTeam} onMnf={() => showMnf(true)} />;
  }

  if (!live || live.week !== week || gameSlate === null) return <Loading />;

  const header = (
    <HeaderControls
      week={week}
      currentWeek={info.week}
      onWeek={next => setReplayWeek(next === info.week ? null : next)}
      onChangeTeam={changeTeam}
      onMnf={showMnf}
    />
  );

  if (replay) {
    return (
      <MatchupPage
        key={`replay-${picked}-${week}`}
        slate={live.slate}
        subtitle={`WEEK ${week} REPLAY · ${info.name.toUpperCase()}`}
        headerExtra={header}
        storageKey={`ff_replay_v1_${picked}_${week}`}
        replay
      />
    );
  }

  return (
    <MatchupPage
      key={`live-${picked}-${week}`}
      slate={gameSlate}
      subtitle={`WEEK ${info.week} · ${info.name.toUpperCase()}`}
      headerExtra={header}
      liveNow={liveNow}
      liveClock={liveClock}
      storageKey={`ff_live_v1_${week}`}
      talk={talk}
      remoteTaunt={remoteTaunt}
    />
  );
}
