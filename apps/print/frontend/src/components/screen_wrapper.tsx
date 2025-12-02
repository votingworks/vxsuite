import React from 'react';
import { Link, useRouteMatch } from 'react-router-dom';

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

import { Toolbar } from './toolbar';
import { routeMap } from '../routes';
import {
  getElectionRecord,
  getMachineConfig,
  getPrecinctSelection,
} from '../api';

export function ScreenWrapper({
  children,
  authType,
  centerChild = false,
}: {
  children: React.ReactNode;
  authType: 'system_admin' | 'election_manager' | 'poll_worker';
  centerChild?: boolean;
}): JSX.Element | null {
  const currentRoute = useRouteMatch();
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const getPrecinctSelectionQuery = getPrecinctSelection.useQuery();

  if (
    !getElectionRecordQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !getPrecinctSelectionQuery.isSuccess
  ) {
    return null;
  }

  const electionRecord = getElectionRecordQuery.data;
  const machineConfig = getMachineConfigQuery.data;
  const precinctSelection = getPrecinctSelectionQuery.data;

  const showNavItems = electionRecord !== null || authType === 'system_admin';

  return (
    <Screen flexDirection="row">
      <LeftNav style={{ flexShrink: 0 }}>
        <Link to="/print">
          <AppLogo appName="VxPrint" />
        </Link>
        <NavList>
          {showNavItems &&
            Object.values(routeMap[authType]).map((route) => (
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
            electionDefinition={electionRecord?.electionDefinition}
            electionPackageHash={electionRecord?.electionPackageHash}
            codeVersion={machineConfig.codeVersion}
            machineId={machineConfig.machineId}
            inverse
            precinctSelection={precinctSelection || undefined}
          />
        </div>
      </LeftNav>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <Toolbar />
        <Main centerChild={centerChild}>{children}</Main>
      </div>
    </Screen>
  );
}
