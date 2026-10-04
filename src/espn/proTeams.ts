export interface ProTeam {
  id: number;
  abbrev: string;
  c1: string;
  c2: string;
  numC?: string;
}

export const PRO_TEAMS: Record<number, ProTeam> = {
  1: { id: 1, abbrev: 'ATL', c1: '#A71930', c2: '#1b1b1b' },
  2: { id: 2, abbrev: 'BUF', c1: '#00338D', c2: '#C60C30' },
  3: { id: 3, abbrev: 'CHI', c1: '#0B162A', c2: '#C83803' },
  4: { id: 4, abbrev: 'CIN', c1: '#FB4F14', c2: '#1b1b1b' },
  5: { id: 5, abbrev: 'CLE', c1: '#311D00', c2: '#FF3C00' },
  6: { id: 6, abbrev: 'DAL', c1: '#041E42', c2: '#869397' },
  7: { id: 7, abbrev: 'DEN', c1: '#FB4F14', c2: '#002244' },
  8: { id: 8, abbrev: 'DET', c1: '#0076B6', c2: '#B0B7BC' },
  9: { id: 9, abbrev: 'GB', c1: '#203731', c2: '#FFB612' },
  10: { id: 10, abbrev: 'TEN', c1: '#0C2340', c2: '#4B92DB' },
  11: { id: 11, abbrev: 'IND', c1: '#002C5F', c2: '#A2AAAD' },
  12: { id: 12, abbrev: 'KC', c1: '#E31837', c2: '#FFB81C' },
  13: { id: 13, abbrev: 'LV', c1: '#1b1b1b', c2: '#A5ACAF' },
  14: { id: 14, abbrev: 'LAR', c1: '#003594', c2: '#FFA300' },
  15: { id: 15, abbrev: 'MIA', c1: '#008E97', c2: '#FC4C02' },
  16: { id: 16, abbrev: 'MIN', c1: '#4F2683', c2: '#FFC62F' },
  17: { id: 17, abbrev: 'NE', c1: '#002244', c2: '#C60C30' },
  18: { id: 18, abbrev: 'NO', c1: '#D3BC8D', c2: '#101820' },
  19: { id: 19, abbrev: 'NYG', c1: '#0B2265', c2: '#A71930' },
  20: { id: 20, abbrev: 'NYJ', c1: '#125740', c2: '#000000' },
  21: { id: 21, abbrev: 'PHI', c1: '#004C54', c2: '#A5ACAF' },
  22: { id: 22, abbrev: 'ARI', c1: '#97233F', c2: '#1b1b1b' },
  23: { id: 23, abbrev: 'PIT', c1: '#1b1b1b', c2: '#FFB612', numC: '#FFB612' },
  24: { id: 24, abbrev: 'LAC', c1: '#0080C6', c2: '#FFC20E' },
  25: { id: 25, abbrev: 'SF', c1: '#AA0000', c2: '#B3995D' },
  26: { id: 26, abbrev: 'SEA', c1: '#002244', c2: '#69BE28' },
  27: { id: 27, abbrev: 'TB', c1: '#D50A0A', c2: '#34302B' },
  28: { id: 28, abbrev: 'WSH', c1: '#5A1414', c2: '#FFB612' },
  29: { id: 29, abbrev: 'CAR', c1: '#0085CA', c2: '#101820' },
  30: { id: 30, abbrev: 'JAX', c1: '#006778', c2: '#D7A22A' },
  33: { id: 33, abbrev: 'BAL', c1: '#241773', c2: '#9E7C0C' },
  34: { id: 34, abbrev: 'HOU', c1: '#03202F', c2: '#A71930' },
};

// ESPN files players who aren't on an NFL roster (cut, unsigned) under proTeamId 0.
export const FREE_AGENT: ProTeam = { id: 0, abbrev: 'FA', c1: '#6b6475', c2: '#c9c3b6' };

export function proTeamById(id: number): ProTeam {
  if (id === 0) return FREE_AGENT;
  const team = PRO_TEAMS[id];
  if (!team) throw new Error('unknown proTeamId ' + id);
  return team;
}
