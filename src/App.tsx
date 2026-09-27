import { useMemo } from 'react';
import { mockSlate } from './sim/mock';
import { MatchupPage } from './ui/MatchupPage';

export default function App() {
  const slate = useMemo(() => mockSlate('Half PPR'), []);

  return <MatchupPage slate={slate} />;
}
