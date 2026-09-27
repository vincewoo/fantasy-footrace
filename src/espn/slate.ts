import type { Hair, Lane, Player, Pos, Slate, TeamColors } from '../model/types';
import { mulberry } from '../sim/mock';
import { PRO_TEAMS, proTeamById } from './proTeams';
import { buildTimeline, GAME_MS, timeLabel } from './timeline';

export const SLOT_LABEL: Record<number, string> = {
  0: 'QB',
  1: 'TQB',
  2: 'RB',
  3: 'RB/WR',
  4: 'WR',
  5: 'WR/TE',
  6: 'TE',
  7: 'OP',
  8: 'DT',
  9: 'DE',
  10: 'LB',
  11: 'DL',
  12: 'CB',
  13: 'S',
  14: 'DB',
  15: 'DP',
  16: 'D/ST',
  17: 'K',
  23: 'FLEX',
};

export const LANE_ORDER: number[] = [0, 1, 2, 3, 4, 5, 6, 23, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

export function posOf(defaultPositionId: number): Pos {
  switch (defaultPositionId) {
    case 1: return 'QB';
    case 2: return 'RB';
    case 3: return 'WR';
    case 4: return 'TE';
    case 5: return 'K';
    case 16: return 'DST';
    case 8:
    case 9:
    case 10:
    case 11:
    case 12:
    case 13: return 'DP';
    default: throw new Error('unknown defaultPositionId ' + defaultPositionId);
  }
}

export interface LeagueTeam {
  id: number;
  name: string;
  owner: string;
}

interface ProGame {
  id: number;
  date: number;
  homeProTeamId: number;
  awayProTeamId: number;
}

const HAIRS: Hair[] = ['short', 'fade', 'buzz', 'curly', 'locs'];
const HAIR_COLORS = ['#1d1411', '#5a3a22', '#7a5534', '#d4a650', '#2a1d15'];
const PRO_BY_ABBREV = new Map(Object.values(PRO_TEAMS).map(t => [t.abbrev, t]));

function ownerOf(members: Map<string, any>, team: any): string {
  const member = members.get(team?.primaryOwner);
  if (!member) return '';
  return member.firstName || member.displayName;
}

function lookOf(id: number, pos: Pos): Pick<Player, 'skin' | 'hair' | 'hc' | 'beard'> {
  const rng = mulberry(id);
  const skin = Math.floor(rng() * 5);
  const hair = rng();
  const hc = rng();
  const beard = rng();
  return {
    skin,
    hair: pos === 'DST' ? 'helmet' : HAIRS[Math.floor(hair * 5)],
    hc: HAIR_COLORS[Math.floor(hc * 5)],
    beard: beard < 0.35,
  };
}

export function proTeamsOf(season: any): any[] {
  const proTeams = season?.settings?.proTeams;
  if (!Array.isArray(proTeams)) throw new Error('season response has no settings.proTeams');
  return proTeams;
}

function weekGames(season: any, week: number): ProGame[] {
  const games = new Map<number, ProGame>();
  for (const team of proTeamsOf(season)) {
    for (const game of team.proGamesByScoringPeriod?.[String(week)] ?? []) {
      if (!games.has(game.id)) games.set(game.id, game);
    }
  }
  return [...games.values()];
}

function weekProj(stats: any[] | undefined, week: number): number {
  const stat = (stats ?? []).find(
    s => s.statSourceId === 1 && s.statSplitTypeId === 1 && s.scoringPeriodId === week,
  );
  return stat ? Math.round(stat.appliedTotal * 100) / 100 : 0;
}

function startersOf(side: any): any[] {
  const entries = side.rosterForCurrentScoringPeriod?.entries ?? [];
  return entries.filter((e: any) => e.lineupSlotId !== 20 && e.lineupSlotId !== 21);
}

function bySlot(entries: any[]): Map<number, any[]> {
  const slots = new Map<number, any[]>();
  for (const entry of entries) {
    const list = slots.get(entry.lineupSlotId);
    if (list) list.push(entry);
    else slots.set(entry.lineupSlotId, [entry]);
  }
  return slots;
}

export function listTeams(league: any): LeagueTeam[] {
  const members = new Map<string, any>((league.members ?? []).map((m: any) => [m.id, m]));
  return (league.teams ?? []).map((team: any) => ({
    id: team.id,
    name: team.name,
    owner: ownerOf(members, team),
  }));
}

export function buildSlate(
  league: any,
  season: any,
  myTeamId: number,
  opts: { timeZone: string },
): Slate {
  const week: number = league.scoringPeriodId;
  const matchup = (league.schedule ?? []).find(
    (m: any) => m.home.teamId === myTeamId || m.away.teamId === myTeamId,
  );
  if (!matchup) throw new Error('no matchup for team ' + myTeamId);

  const teams = new Map<number, any>((league.teams ?? []).map((t: any) => [t.id, t]));
  const members = new Map<string, any>((league.members ?? []).map((m: any) => [m.id, m]));
  const mine = matchup.home.teamId === myTeamId ? matchup.home : matchup.away;
  const theirs = matchup.home.teamId === myTeamId ? matchup.away : matchup.home;

  const games = weekGames(season, week);
  const gameByTeam = new Map<number, ProGame>();
  const kickoffByAbbrev = new Map<string, number>();
  for (const game of games) {
    for (const id of [game.homeProTeamId, game.awayProTeamId]) {
      gameByTeam.set(id, game);
      const pro = PRO_TEAMS[id];
      if (pro) kickoffByAbbrev.set(pro.abbrev, game.date);
    }
  }

  const timeline = buildTimeline(games.map(g => g.date), opts.timeZone);

  const me = { name: teams.get(myTeamId).name, owner: 'YOU' };
  const oppTeam = teams.get(theirs.teamId);
  const opp = { name: oppTeam.name, owner: ownerOf(members, oppTeam).toUpperCase() };

  const toPlayer = (entry: any): Player => {
    const p = entry.playerPoolEntry.player;
    const pos = posOf(p.defaultPositionId);
    const team = proTeamById(p.proTeamId).abbrev;
    const jersey = Number.parseInt(p.jersey ?? '', 10);
    const game = gameByTeam.get(p.proTeamId);
    const window: [number, number] = game
      ? [timeline.toT(game.date), timeline.toT(game.date + GAME_MS)]
      : [1, 1];
    const player: Player = {
      id: String(p.id),
      name: p.fullName,
      last: p.lastName,
      ...lookOf(p.id, pos),
      pos,
      team,
      num: pos === 'DST' ? 'D' : Number.isNaN(jersey) ? 0 : jersey,
      proj: weekProj(p.stats, week),
      window,
    };
    if (pos === 'DST') player.tag = team + ' D';
    return player;
  };

  const emptyPlayer = (other: Player): Player => ({
    id: 'empty',
    name: 'EMPTY',
    last: 'EMPTY',
    ...lookOf(0, other.pos),
    pos: other.pos,
    team: other.team,
    num: 0,
    proj: 0,
    window: [1, 1],
  });

  const mineBySlot = bySlot(startersOf(mine));
  const theirsBySlot = bySlot(startersOf(theirs));
  const lanes: Lane[] = [];
  for (const slot of LANE_ORDER) {
    const meEntries = mineBySlot.get(slot) ?? [];
    const oppEntries = theirsBySlot.get(slot) ?? [];
    const count = Math.max(meEntries.length, oppEntries.length);
    for (let i = 0; i < count; i += 1) {
      const mePlayer = meEntries[i] ? toPlayer(meEntries[i]) : emptyPlayer(toPlayer(oppEntries[i]));
      const oppPlayer = oppEntries[i] ? toPlayer(oppEntries[i]) : emptyPlayer(mePlayer);
      lanes.push({ slot: SLOT_LABEL[slot], me: mePlayer, opp: oppPlayer });
    }
  }

  const teamColors: Record<string, TeamColors> = {};
  for (const lane of lanes) {
    for (const player of [lane.me, lane.opp]) {
      if (player.team in teamColors) continue;
      const pro = PRO_BY_ABBREV.get(player.team);
      if (!pro) continue;
      teamColors[player.team] = pro.numC
        ? { c1: pro.c1, c2: pro.c2, numC: pro.numC }
        : { c1: pro.c1, c2: pro.c2 };
    }
  }

  const statusLabel = (p: Player, t: number): string => {
    const kickoff = kickoffByAbbrev.get(p.team);
    if (p.window[0] === 1 && p.proj === 0 && kickoff === undefined) return 'BYE';
    if (t < p.window[0]) return kickoff === undefined ? 'BYE' : 'KO ' + timeLabel(kickoff, opts.timeZone, true);
    if (t >= p.window[1]) return 'FINAL';
    return 'LIVE';
  };

  return {
    me,
    opp,
    lanes,
    events: [],
    teamColors,
    clockLabel: timeline.clockLabel,
    statusLabel,
    axis: timeline.axis,
  };
}
