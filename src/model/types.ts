export type Side = 'me' | 'opp';

export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST' | 'DP';

export type EventKind =
  | 'pass'
  | 'passTD'
  | 'int'
  | 'rush'
  | 'rushTD'
  | 'catch'
  | 'recTD'
  | 'fumble'
  | 'fg'
  | 'xp'
  | 'sack'
  | 'dint'
  | 'fumrec'
  | 'dtd'
  | 'injury';

export type Hair = 'short' | 'fade' | 'buzz' | 'curly' | 'locs' | 'helmet';

export interface TeamColors {
  c1: string;
  c2: string;
  numC?: string;
}

export interface Player {
  id: string;
  name: string;
  last: string;
  tag?: string;
  pos: Pos;
  team: string;
  num: number | 'D';
  proj: number;
  skin: number;
  sc?: string;
  hair: Hair;
  hc?: string;
  beard?: boolean;
  window: [number, number];
}

export interface Lane {
  slot: string;
  me: Player;
  opp: Player;
}

export interface FantasyTeam {
  name: string;
  owner: string;
}

export interface PlayEvent {
  id: number;
  t: number;
  side: Side;
  lane: number;
  kind: EventKind;
  yds: number;
  pts: number;
  text: string;
}

export interface Slate {
  me: FantasyTeam;
  opp: FantasyTeam;
  lanes: Lane[];
  events: PlayEvent[];
  teamColors: Record<string, TeamColors>;
  clockLabel(t: number): string;
  statusLabel(p: Player, t: number): string;
  axis: { label: string; t: number }[];
}
