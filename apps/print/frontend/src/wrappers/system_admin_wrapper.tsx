import { ElectionDefinition } from '@votingworks/types';
import {
  LeftNav,
  AppLogo,
  NavList,
  NavListItem,
  VerticalElectionInfoBar,
  Main,
  Screen,
  NavLink,
} from '@votingworks/ui';
import { useRouteMatch, Link } from 'react-router-dom';
import { TopBar } from '../components/top_bar';

export const systemAdministratorRoutes = {
  election: { title: 'Election', path: '/election' },
  settings: { title: 'Settings', path: '/settings' },
} satisfies Record<string, { title: string; path: string }>;

export function SystemAdministratorWrapper({
  children,
  electionDefinition,
  title,
  centerChild = false,
}: {
  children: React.ReactNode;
  electionDefinition: ElectionDefinition | null;
  title: string;
  centerChild?: boolean;
}): JSX.Element {
  const currentRoute = useRouteMatch();
  return (
    <Screen flexDirection="row">
      <LeftNav>
        <Link to="/election">
          <AppLogo appName="VxPrint" />
        </Link>
        <NavList>
          {Object.values(systemAdministratorRoutes).map((route) => (
            <NavListItem key={route.path}>
              <NavLink
                to={route.path}
                isActive={route.path === currentRoute.url}
              >
                {route.title}
              </NavLink>
            </NavListItem>
          ))}
        </NavList>
        <div style={{ marginTop: 'auto' }}>
          <VerticalElectionInfoBar
            mode="admin"
            electionDefinition={electionDefinition || undefined}
            electionPackageHash="TBD"
            codeVersion="TBD"
            machineId="TBD"
            inverse
          />
        </div>
      </LeftNav>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <TopBar title={title} />
        <Main centerChild={centerChild}>{children}</Main>
      </div>
    </Screen>
  );
}
