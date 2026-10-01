import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { buildBoard } from '../espn/mnf';
import { snapshotAt } from '../model/derive';
import { listTeams } from '../espn/slate';
import { MnfPage } from './MnfPage';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(HERE, '../espn/fixtures', name), 'utf8'));

const league = fixture('week3-pregame.json');
const season = fixture('season-2026-proteams.json');
const live = fixture('matchup-week3-live-1141.json');
const info = { week: 3, name: '#fpandfriends', teams: listTeams(league), raw: league };
const TZ = 'America/New_York';
const MNF_KO = 1790640900000;

function board(schedule = live.schedule) {
  return buildBoard(info, schedule, season, { week: 3, timeZone: TZ, now: MNF_KO + 3600000 });
}

function render(b = board(), liveT = b.toT(MNF_KO + 3600000), replay = false): string {
  return renderToStaticMarkup(
    <MnfPage board={b} statuses={{}} liveT={liveT} timeZone={TZ} subtitle="WEEK 3 · #FPANDFRIENDS" replay={replay} />,
  );
}

it('shows the Monday game and one card per matchup with an MNF starter', () => {
  const m = render();

  expect(m).toContain('Monday Night');
  expect(m).toContain('PHI @ CHI');
  expect(m).toContain('>LIVE<');
  expect(m.match(/data-mnf-matchup=/g)).toHaveLength(5);
  expect(m).toContain('5 MATCHUPS · 7 PLAYERS');
});

it('lists only the MNF players, never the rest of a lineup', () => {
  const m = render();

  expect(m.match(/data-mnf-player/g)).toHaveLength(7);
  for (const name of ['Jalen Hurts', 'Saquon Barkley', 'DeVonta Smith', 'Zack Baun', 'Colston Loveland', 'Eagles D/ST', 'D&#x27;Andre Swift']) {
    expect(m).toContain(name);
  }
  expect(m).not.toContain('Jared Goff');
  expect(m).not.toContain('Dak Prescott');
});

it('leads with the closest race and keeps full-lineup scores', () => {
  const m = render();
  const cards = [...m.matchAll(/data-mnf-matchup="(\d+)"/g)].map(match => Number(match[1]));
  const b = board();
  const close = (id: number) => {
    const slate = b.matchups.find(x => x.id === id)!.slate;
    return Math.abs(snapshotAt(slate, b.toT(MNF_KO + 3600000)).winPct - 50);
  };

  expect(cards.map(close)).toEqual([...cards.map(close)].sort((a, c) => a - c));
  expect(m).not.toContain('YOUR MATCHUP');
  expect(m).toContain('>82.8<');
  expect(m).toContain('PRANAY BY 55.1');
});

it('links every card to its full matchup', () => {
  const m = render();

  for (const matchup of board().matchups) {
    expect(m).toContain(`href="#team/${matchup.teamIds.me}" data-mnf-matchup="${matchup.id}"`);
  }
  expect(m.match(/FULL MATCHUP/g)).toHaveLength(5);
});

it('shows what each side still has left on Monday', () => {
  const m = render();

  expect(m).toContain('2 MNF · ');
  expect(m).toContain('NO MNF');
});

it('reads final once the Monday window closes', () => {
  const b = board();
  expect(render(b, 1)).toContain('>FINAL<');
  expect(render(b, 0, true)).toContain('>FINAL<');
});

it('says so when nobody starts a Monday player', () => {
  const b = { ...board(), matchups: [] };
  expect(render(b)).toContain('Nobody in the league is starting a Monday night player.');
  expect(render({ ...b, games: [] })).toContain('No Monday night games this week.');
});
