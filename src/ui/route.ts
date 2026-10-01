// Every view lives in the URL hash, so a matchup is a link and the back button walks back through what you opened.
export type View = { kind: 'scoreboard' } | { kind: 'mnf' } | { kind: 'matchup'; team: number };

export function parseView(hash: string): View {
  const path = hash.replace(/^#\/?/, '');
  if (path === 'mnf') return { kind: 'mnf' };
  const team = /^team\/(\d+)$/.exec(path);
  if (team) return { kind: 'matchup', team: Number(team[1]) };
  return { kind: 'scoreboard' };
}

export function viewHref(view: View): string {
  if (view.kind === 'mnf') return '#mnf';
  if (view.kind === 'matchup') return `#team/${view.team}`;
  return '#';
}

export function matchupHref(team: number): string {
  return viewHref({ kind: 'matchup', team });
}
