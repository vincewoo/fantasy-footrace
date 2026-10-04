import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadLeagueInfo, loadLiveSlate, pollLive, type LeagueInfo, type LiveSlate } from './espn/load';
import { mnfOf } from './espn/mnf';
import { fetchScoreboard, statusesByTeam, withGameStatus, type GameStatus } from './espn/scoreboard';
import { timeLabel } from './espn/timeline';
import { loadWeek, pollWeek, type WeekBoard } from './espn/week';
import type { Slate } from './model/types';
import { ConnectError, HeaderControls } from './ui/Connect';
import { MatchupPage } from './ui/MatchupPage';
import { MnfPage } from './ui/MnfPage';
import { parseView, type View } from './ui/route';
import { ScoreboardPage } from './ui/ScoreboardPage';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const POLL_MS = 15000;

const WEEK_CHECK_MS = 10 * 60 * 1000;

function readView(): View {
  return typeof location === 'undefined' ? { kind: 'scoreboard' } : parseView(location.hash);
}

function inGame(slate: Slate, tNow: number, withBench = false): boolean {
  const players = slate.lanes.flatMap(lane => [lane.me, lane.opp]);
  if (withBench && slate.bench) players.push(...[...slate.bench.me, ...slate.bench.opp].map(seat => seat.player));
  return players.some(p => p.id !== 'empty' && p.window[0] < tNow && tNow < p.window[1]);
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
  const [view, setView] = useState<View>(readView);
  const [replayWeek, setReplayWeek] = useState<number | null>(null);
  const [live, setLive] = useState<LiveSlate | null>(null);
  const [board, setBoard] = useState<WeekBoard | null>(null);
  const [statuses, setStatuses] = useState<Record<string, GameStatus>>({});
  const [error, setError] = useState<unknown>(null);

  const liveRef = useRef<LiveSlate | null>(null);
  const boardRef = useRef<WeekBoard | null>(null);
  const pollingRef = useRef(false);
  const infoRef = useRef<LeagueInfo | null>(null);
  infoRef.current = info;
  const team = view.kind === 'matchup' && info?.teams.some(t => t.id === view.team) ? view.team : null;
  // The scoreboard and Monday night read the same week board, so moving between them costs no fetch.
  // A link to a team the league doesn't have lands on the scoreboard.
  const onBoard = team === null;
  const week = info ? (replayWeek !== null && replayWeek < info.week ? replayWeek : info.week) : null;
  const replay = info !== null && week !== info.week;

  useEffect(() => {
    let ignore = false;
    setError(null);
    setInfo(null);
    setLive(null);
    setBoard(null);
    liveRef.current = null;
    boardRef.current = null;
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
    const onNavigate = () => {
      setView(readView());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onNavigate);
    return () => window.removeEventListener('hashchange', onNavigate);
  }, []);

  // One team's matchup, read in full with DST drive history, while a matchup page is open.
  useEffect(() => {
    const info = infoRef.current;
    if (!info || team === null || week === null) return;
    let ignore = false;
    setError(null);
    setLive(null);
    liveRef.current = null;
    pollingRef.current = false;
    setStatuses({});
    loadLiveSlate(info, team, { timeZone: TZ, week })
      .then(next => {
        if (ignore) return;
        liveRef.current = next;
        setLive(next);
        if (replay) return;
        fetchScoreboard(next.season, next.week)
          .then(scoreboard => {
            if (!ignore) setStatuses(statusesByTeam(scoreboard));
          })
          .catch(() => {
            // the timeline labels stand in until a scoreboard read succeeds
          });
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught);
      });
    return () => {
      ignore = true;
    };
  }, [week, team, replay]);

  // Every matchup of the week, while the scoreboard or Monday night is open.
  useEffect(() => {
    const info = infoRef.current;
    if (!info || week === null || !onBoard) return;
    let ignore = false;
    setError(null);
    setBoard(null);
    boardRef.current = null;
    pollingRef.current = false;
    setStatuses({});
    loadWeek(info, { timeZone: TZ, week })
      .then(next => {
        if (ignore) return;
        boardRef.current = next;
        setBoard(next);
        if (replay) return;
        fetchScoreboard(next.season, next.week)
          .then(scoreboard => {
            if (!ignore) setStatuses(statusesByTeam(scoreboard));
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
  }, [week, onBoard, replay]);

  // Live polls only run while someone on the page is actually playing.
  useEffect(() => {
    if (!info || replay) return;
    let ignore = false;

    const pollOne = () => {
      if (pollingRef.current) return;
      const now = Date.now();
      let read: Promise<unknown>;
      let season: number;
      let weekNo: number;

      if (onBoard) {
        const current = boardRef.current;
        if (!current || !current.matchups.some(m => inGame(m.slate, current.toT(now)))) return;
        season = current.season;
        weekNo = current.week;
        read = pollWeek(info, current, { timeZone: TZ }).then(next => {
          if (ignore) return;
          boardRef.current = next;
          setBoard(next);
        });
      } else {
        const current = liveRef.current;
        // The matchup page also shows bench scores, so a benched player's game keeps it polling.
        if (!current || !inGame(current.slate, current.toT(now), true)) return;
        season = current.season;
        weekNo = current.week;
        read = pollLive(info, current).then(next => {
          if (ignore) return;
          liveRef.current = next;
          setLive(next);
        });
      }

      pollingRef.current = true;
      const matchups = read.catch(() => {
        // a failed poll keeps the current scores and is retried on the next tick
      });
      const scoreboard = fetchScoreboard(season, weekNo)
        .then(next => {
          if (!ignore) setStatuses(statusesByTeam(next));
        })
        .catch(() => {
          // a failed scoreboard read keeps the previous statuses
        });
      Promise.all([matchups, scoreboard]).finally(() => {
        pollingRef.current = false;
      });
    };

    const timer = setInterval(pollOne, POLL_MS);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [info, team, onBoard, replay]);

  const liveNow = useCallback(() => (liveRef.current ? liveRef.current.toT(Date.now()) : 0), []);
  const liveClock = useCallback(() => timeLabel(Date.now(), TZ, true), []);
  const gameSlate = useMemo(
    () => (live ? withGameStatus(live.slate, statuses, live.toT(Date.now())) : null),
    [live?.slate, statuses],
  );
  const mnf = useMemo(() => (board ? mnfOf(board) : null), [board]);

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

  if (!info || week === null) return <Loading />;

  const header = (
    <HeaderControls
      week={week}
      currentWeek={info.week}
      onWeek={next => setReplayWeek(next === info.week ? null : next)}
      view={onBoard && view.kind === 'matchup' ? 'scoreboard' : view.kind}
    />
  );
  const subtitle = `WEEK ${week}${replay ? ' REPLAY' : ''} · ${info.name.toUpperCase()}`;

  if (view.kind === 'mnf') {
    if (!board || !mnf || board.week !== week) return <Loading />;
    return (
      <MnfPage
        key={`mnf-${week}`}
        board={mnf}
        statuses={statuses}
        liveT={board.toT(Date.now())}
        timeZone={TZ}
        subtitle={subtitle}
        headerExtra={header}
        replay={replay}
      />
    );
  }

  if (team === null) {
    if (!board || board.week !== week) return <Loading />;
    return (
      <ScoreboardPage
        key={`scoreboard-${week}`}
        board={board}
        liveT={board.toT(Date.now())}
        subtitle={subtitle}
        headerExtra={header}
        replay={replay}
      />
    );
  }

  if (!live || live.week !== week || live.myTeamId !== team || gameSlate === null) return <Loading />;

  if (replay) {
    return (
      <MatchupPage
        key={`replay-${team}-${week}`}
        slate={live.slate}
        subtitle={subtitle}
        headerExtra={header}
        storageKey={`ff_replay_v1_${team}_${week}`}
      />
    );
  }

  return (
    <MatchupPage
      key={`live-${team}-${week}`}
      slate={gameSlate}
      subtitle={subtitle}
      headerExtra={header}
      liveNow={liveNow}
      liveClock={liveClock}
      storageKey={`ff_live_v1_${team}_${week}`}
    />
  );
}
