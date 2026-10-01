import { expect, it } from 'vitest';
import { matchupHref, parseView, viewHref } from './route';

it('reads the scoreboard, Monday night and a team matchup from the hash', () => {
  expect(parseView('')).toEqual({ kind: 'scoreboard' });
  expect(parseView('#')).toEqual({ kind: 'scoreboard' });
  expect(parseView('#mnf')).toEqual({ kind: 'mnf' });
  expect(parseView('#team/7')).toEqual({ kind: 'matchup', team: 7 });
  expect(parseView('#/team/12')).toEqual({ kind: 'matchup', team: 12 });
});

it('falls back to the scoreboard for a hash it does not know', () => {
  expect(parseView('#team/x')).toEqual({ kind: 'scoreboard' });
  expect(parseView('#nope')).toEqual({ kind: 'scoreboard' });
});

it('writes every view back to a hash it reads the same way', () => {
  for (const view of [{ kind: 'scoreboard' }, { kind: 'mnf' }, { kind: 'matchup', team: 3 }] as const) {
    expect(parseView(viewHref(view))).toEqual(view);
  }
  expect(matchupHref(5)).toBe('#team/5');
});
