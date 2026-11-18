import type { ElectionPackageRenderingStatus } from '@votingworks/admin-backend';
import type { ElectionId } from '@votingworks/types';
import type { NavItem } from '../components/sidebar.js';
import { routerPaths } from '../router_paths.js';

export function getNavItems(
  electionId: ElectionId,
  electionPackage: ElectionPackageRenderingStatus | null
): NavItem[] {
  const definitionItem: NavItem = {
    label: 'Definition',
    routerPath: routerPaths.electionDefinitionForElection(electionId),
  };
  if (electionPackage?.status === 'loaded') {
    return [definitionItem];
  }
  return [
    definitionItem,
    {
      label: 'Proof Ballots',
      routerPath: routerPaths.proofBallotsForElection(electionId),
    },
    {
      label: 'Finalize',
      routerPath: routerPaths.finalizeForElection(electionId),
    },
  ];
}
