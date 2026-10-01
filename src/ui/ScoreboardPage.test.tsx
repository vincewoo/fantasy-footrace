import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { buildWeek } from '../espn/week';
import { listTeams } from '../espn/slate';
import { fmt, snapshotAt } from '../model/derive';
import { progressOf, ScoreboardPage } from './ScoreboardPage';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(HERE, '../espn/fixtures', name), 'utf8'));

const league = fixture('week3-pregame.json');
const season = fixture('season-2026-proteams.json');
const live = fixture('matchup-week3-live-1141.json');
const info = { week: 3, name: '#fpandfriends', teams: listTeams(league), raw: league };
const TZ = 'America/New_York';
const SUNDAY = 1790528400000 + 60 * 60 * 1000;

const board = buildWeek(info, live.schedule, season, { week: 3, timeZone: TZ, now: SUNDAY });

function render(liveT = board.toT(SUNDAY), replay = false): string {
  return renderToStaticMarkup(
    <ScoreboardPage board={board} liveT={liveT} subtitle="WEEK 3 · #FPANDFRIENDS" replay={replay} />,
  );
}

it('shows one tile per matchup, each linking to its full matchup', () => {
  const m = render();

  expect(m).toContain('Scoreboard');
  expect(m).toContain('WEEK 3 · #FPANDFRIENDS');
  expect(m).toContain(`${board.matchups.length} MATCHUPS`);
  expect(m.match(/data-matchup-tile=/g)).toHaveLength(board.matchups.length);
  for (const matchup of board.matchups) {
    expect(m).toContain(`href="#team/${matchup.teamIds.me}" data-matchup-tile="${matchup.id}"`);
  }
});

it('shows both teams, their owners and live scores on each tile', () => {
  const m = render();
  const t = board.toT(SUNDAY);

  for (const { slate } of board.matchups) {
    const snap = snapshotAt(slate, t);
    expect(m).toContain(slate.me.name.replace(/'/g, '&#x27;'));
    expect(m).toContain(slate.opp.name.replace(/'/g, '&#x27;'));
    expect(m).toContain(`>${fmt(snap.totals.me)}<`);
    expect(m).toContain(`>${fmt(snap.totals.opp)}<`);
  }
  expect(m).toContain('PRANAY · PROJ');
});

it('counts who is still to play on each side', () => {
  const slate = board.matchups[0].slate;

  expect(progressOf(slate, 'me', -1)).toEqual({ playing: 0, left: slate.lanes.filter(l => l.me.id !== 'empty').length });
  expect(progressOf(slate, 'me', 1)).toEqual({ playing: 0, left: 0 });
  const mid = board.toT(SUNDAY);
  const { playing, left } = progressOf(slate, 'me', mid);
  expect(playing).toBeLessThanOrEqual(left);
});

it('reads final, with a winner, for a replay or once the week is over', () => {
  const m = render(0, true);

  expect(m).toContain('>FINAL<');
  expect(m).not.toContain('>LIVE<');
  expect(m).toMatch(/ WINS</);
  expect(render(1)).toContain('>FINAL<');
});

it('reads upcoming before the first kickoff', () => {
  const m = render(0);

  expect(m).toContain('UPCOMING');
  expect(m).toContain('PICK A MATCHUP TO WATCH IT');
});

it('says so when the week has no matchups', () => {
  const m = renderToStaticMarkup(
    <ScoreboardPage board={{ ...board, matchups: [] }} liveT={0} subtitle="x" />,
  );

  expect(m).toContain('No matchups this week.');
});
