import React from 'react';
import {
  Screen,
  LeftNav,
  AppLogo,
  NavList,
  NavListItem,
  NavLink,
  VerticalElectionInfoBar,
  Main,
} from '@votingworks/ui';
import { Link, useRouteMatch } from 'react-router-dom';
import { ElectionDefinition } from '@votingworks/types/src/election';
import { TopBar } from '../components/top_bar';
import { Toolbar } from '../components/toolbar';

export const electionManagerRoutes = {
  print: { title: 'Print', path: '/print' },
  election: { title: 'Election', path: '/election' },
  settings: { title: 'Settings', path: '/settings' },
} satisfies Record<string, { title: string; path: string }>;

export function ElectionManagerWrapper({
  children,
  electionDefinition,
  title,
  centerChild = false,
}: {
  children: React.ReactNode;
  electionDefinition: ElectionDefinition;
  title: string;
  centerChild?: boolean;
}): JSX.Element {
  const currentRoute = useRouteMatch();
  return (
    <Screen flexDirection="row">
      <LeftNav>
        <Link to="/print">
          <AppLogo appName="VxPrint" />
        </Link>
        <NavList>
          {Object.values(electionManagerRoutes).map((route) => (
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
            electionDefinition={electionDefinition}
            electionPackageHash="TBD"
            codeVersion="TBD"
            machineId="TBD"
            inverse
          />
        </div>
      </LeftNav>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <Toolbar />
        <TopBar title={title} />
        <Main centerChild={centerChild}>{children}</Main>
      </div>
    </Screen>
  );
}
