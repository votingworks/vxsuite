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

export const electionManagerRoutes = {
  print: { title: 'Print', path: '/print' },
  election: { title: 'Election', path: '/election' },
  settings: { title: 'Settings', path: '/settings' },
} satisfies Record<string, { title: string; path: string }>;

export function ElectionManagerWrapper({
  children,
  electionDefinition,
}: {
  children: React.ReactNode;
  electionDefinition: ElectionDefinition;
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
      <Main centerChild>{children}</Main>
    </Screen>
  );
}
