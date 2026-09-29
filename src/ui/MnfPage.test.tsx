import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { buildBoard } from '../espn/mnf';
import { listTeams } from '../espn/slate';
import { HeaderControls, TeamPicker } from './Connect';
import { MnfPage } from './MnfPage';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): any => JSON.parse(readFileSync(join(HERE, '../espn/fixtures', name), 'utf8'));

const league = fixture('week3-pregame.json');
const season = fixture('season-2026-proteams.json');
const live = fixture('matchup-week3-live-1141.json');
const info = { week: 3, name: '#fpandfriends', teams: listTeams(league), raw: league };
const TZ = 'America/New_York';
const MNF_KO = 1790640900000;

function board(myTeamId: number | null, schedule = live.schedule) {
  return buildBoard(info, schedule, season, { week: 3, timeZone: TZ, myTeamId, now: MNF_KO + 3600000 });
}

function render(b = board(1), liveT = b.toT(MNF_KO + 3600000), replay = false): string {
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

it('puts your matchup first and keeps full-lineup scores', () => {
  const m = render();
  const first = m.indexOf('data-mnf-matchup=');

  expect(m.slice(first, first + 30)).toContain('"16"');
  expect(m).toContain('YOUR MATCHUP');
  expect(m).toContain('Somethings Gotta Gibbs');
  expect(m).toContain('>42.3<');
  expect(m).toContain('>82.8<');
  expect(m).toContain('PRANAY BY 55.1');
});

it('shows what each side still has left on Monday', () => {
  const m = render();

  expect(m).toContain('2 MNF · ');
  expect(m).toContain('NO MNF');
});

it('reads final once the Monday window closes', () => {
  const b = board(1);
  expect(render(b, 1)).toContain('>FINAL<');
  expect(render(b, 0, true)).toContain('>FINAL<');
});

it('says so when nobody starts a Monday player', () => {
  const b = { ...board(1), matchups: [] };
  expect(render(b)).toContain('Nobody in the league is starting a Monday night player.');
  expect(render({ ...b, games: [] })).toContain('No Monday night games this week.');
});

it('offers the MNF toggle from the header and the team picker', () => {
  const noop = () => {};
  expect(renderToStaticMarkup(<HeaderControls week={3} currentWeek={3} onWeek={noop} onChangeTeam={noop} onMnf={noop} />)).toContain('>MNF<');
  const back = renderToStaticMarkup(<HeaderControls week={3} currentWeek={3} onWeek={noop} mnf onMnf={noop} />);
  expect(back).toContain('>MY MATCHUP<');
  expect(back).not.toContain('CHANGE TEAM');
  expect(renderToStaticMarkup(<TeamPicker teams={info.teams} leagueName="x" onPick={noop} onMnf={noop} />)).toContain('JUST WATCH MONDAY NIGHT');
});
