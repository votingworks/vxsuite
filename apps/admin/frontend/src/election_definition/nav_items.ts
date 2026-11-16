import type { ElectionId } from '@votingworks/types';
import type { NavItem } from '../components/sidebar.js';
import { routerPaths } from '../router_paths.js';

export function getNavItems(electionId: ElectionId): NavItem[] {
  return [
    {
      label: 'Definition',
      routerPath: routerPaths.electionDefinitionForElection(electionId),
    },
    {
      label: 'Proof Ballots',
      routerPath: routerPaths.proofBallotsForElection(electionId),
    },
  ];
}
