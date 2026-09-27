import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { snapshotAt } from '../model/derive';
import { mockSlate } from '../sim/mock';
import { EspnError } from '../espn/client';
import { ConnectError, TeamPicker } from './Connect';
import { MatchupPage } from './MatchupPage';

const HALF = mockSlate('Half PPR');
const TAUNTS = ['TOO EASY', 'SCOREBOARD!', 'LUCKY BOUNCE', 'BENCH HIM', 'WAIT TILL SNF', 'GG NO RE'];

it('renders the design\u2019s header, scoreboard and controls on the first frame', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);

  expect(m).toContain('Hail Mary Poppins');
  expect(m).toContain('The Kupp Runneth Over');
  expect(m).toContain('WEEK 4 · SUNDAY SLATE · BACKYARD LEAGUE');
  expect(m).toContain('>15.1<');
  expect(m).toContain('>9.1<');
  expect(m).toContain('PROJ 137.7');
  expect(m).toContain('PROJ 132.9');
  expect(m).toContain('YOU 59%');
  expect(m).toContain('41% DAVE');
  expect(m).toContain('1:38 PM');
  expect(m).toContain('>LIVE<');
  expect(m).toContain('19 PLAYS');
  expect(m).toContain('src="/logo.svg"');
  expect(m).toContain('SOUND: OFF');
  expect(m).toContain('>x1<');
  expect(m).toContain('>PAUSE<');
});

it('renders the newest play at the top of the ticker', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);

  expect(m).toContain('Steelers D scoop up a loose ball');
  expect(m).toContain('1:37 PM · D/ST · DAVE');
  expect(m).toContain('>+2.0<');
});

it('renders the nine lane diffs in order', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);
  const diffs = [...m.matchAll(/font-size:10px;font-weight:700;color:[^"]*">([^<]*)</g)].map(match => match[1]);

  expect(diffs).toEqual(['+6.8', '+2.4', '\u22128.1', '+6.4', 'EVEN', 'EVEN', '+0.5', 'EVEN', '\u22122.0']);
});

it('renders the name card of a player who has scored', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);

  expect(m).toContain('BUF · Q1 3:25 · proj 22.4');
  expect(m).toContain('>6.8<');
});

it('renders the six taunt buttons and the transport controls', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);
  const buttons = [...m.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(match => match[1]);

  expect(buttons.filter(text => TAUNTS.includes(text))).toEqual(TAUNTS);
  expect(buttons).toHaveLength(10);
});

it('follows the slate through the pure snapshot', () => {
  expect(snapshotAt(HALF, 0.5).past).toHaveLength(102);
});

it('swaps in the live subtitle and keeps the design one by default', () => {
  const live = renderToStaticMarkup(<MatchupPage slate={HALF} subtitle="WEEK 3 · #FPANDFRIENDS" />);
  const demo = renderToStaticMarkup(<MatchupPage slate={HALF} />);

  expect(live).toContain('WEEK 3 · #FPANDFRIENDS');
  expect(live).not.toContain('BACKYARD LEAGUE');
  expect(demo).toContain('WEEK 4 · SUNDAY SLATE · BACKYARD LEAGUE');
});

it('offers every league team on the picker card', () => {
  const teams = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Team ${i + 1}`, owner: `owner${i + 1}` }));

  const m = renderToStaticMarkup(
    <TeamPicker teams={teams} leagueName="#fpandfriends" onPick={() => {}} onDemo={() => {}} />,
  );

  expect(m).toContain('Pick your team');
  expect(m).toContain('#fpandfriends');
  for (const team of teams) expect(m).toContain(team.name);
  expect(m).toContain('Just watch the demo');
});

it('tells the viewer how to fix a private league', () => {
  const m = renderToStaticMarkup(
    <ConnectError error={new EspnError('not visible', 401, 'private')} onRetry={() => {}} onDemo={() => {}} />,
  );

  expect(m).toContain('.env.local');
  expect(m).toContain('Retry');
  expect(m).toContain('Use demo');
});

it('shows the opponent\u2019s presence and the taunt box in a live room', () => {
  const m = renderToStaticMarkup(
    <MatchupPage
      slate={HALF}
      liveNow={() => 0.06}
      talk={{ connected: true, oppWatching: true, send: () => true }}
    />,
  );

  expect(m).toContain('DAVE IS WATCHING');
  expect(m).toContain('placeholder="SAY SOMETHING"');
  const box = /<input[^>]*placeholder="SAY SOMETHING"[^>]*>/.exec(m)?.[0] ?? '';
  expect(box).toMatch(/maxlength="24"/i);
  expect(box).not.toContain('disabled');
});

it('says talk is offline and disables the box without a room', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} liveNow={() => 0.06} talk={null} />);

  expect(m).toContain('TALK OFFLINE');
  const box = /<input[^>]*placeholder="SAY SOMETHING"[^>]*>/.exec(m)?.[0] ?? '';
  expect(box).toContain('disabled');
});

it('keeps the demo free of the talk box and the room status', () => {
  const m = renderToStaticMarkup(<MatchupPage slate={HALF} />);

  expect(m).not.toContain('SAY SOMETHING');
  expect(m).not.toContain('TALK OFFLINE');
});

it('shows the real current time on the live clock instead of the timeline time', () => {
  const m = renderToStaticMarkup(
    <MatchupPage slate={HALF} liveNow={() => 0.06} liveClock={() => 'SUN 5:15 AM'} />,
  );

  expect(m).toContain('SUN 5:15 AM');
  expect(m).not.toContain('1:38 PM');
});
