import { P } from '@votingworks/ui';
import { NavigationScreen } from '../components/navigation_screen.js';
import type { NavItem } from '../components/sidebar.js';
import { routerPaths } from '../router_paths.js';

const ELECTION_DEFINITION_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Definition', routerPath: routerPaths.electionDefinition },
];

export function ElectionDefinitionScreen(): JSX.Element {
  return (
    <NavigationScreen
      title="Election Definition"
      navItems={ELECTION_DEFINITION_NAV_ITEMS}
      backRouterPath={routerPaths.election}
    >
      <P>Not Yet Implemented</P>
    </NavigationScreen>
  );
}
