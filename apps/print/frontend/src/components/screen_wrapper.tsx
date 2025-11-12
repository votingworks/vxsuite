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
import { Toolbar } from './toolbar';
import { routeMap } from '../routes';
import { getElectionDefinition } from '../api';

export function ScreenWrapper({
  children,
  authType,
}: {
  children: React.ReactNode;
  authType: 'system_admin' | 'election_manager' | 'poll_worker';
}): JSX.Element {
  const currentRoute = useRouteMatch();
  const getElectionDefinitionQuery = getElectionDefinition.useQuery();
  const electionDefinition = getElectionDefinitionQuery.data;

  return (
    <Screen flexDirection="row">
      <LeftNav>
        <Link to="/print">
          <AppLogo appName="VxPrint" />
        </Link>
        <NavList>
          {Object.values(routeMap[authType]).map((route) => (
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
        <Toolbar />
        <Main>{children}</Main>
      </div>
    </Screen>
  );
}
