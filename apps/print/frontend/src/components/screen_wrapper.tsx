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

import { Toolbar } from './toolbar.js';
import { electionManagerRoutes, routeMap } from '../routes.js';
import {
  getElectionRecord,
  getMachineConfig,
  getPollingPlaceId,
  getSystemSettings,
} from '../api.js';

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
  const getPollingPlaceIdQuery = getPollingPlaceId.useQuery();
  const getSystemSettingsQuery = getSystemSettings.useQuery();

  if (
    !getElectionRecordQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !getPollingPlaceIdQuery.isSuccess ||
    !getSystemSettingsQuery.isSuccess
  ) {
    return null;
  }

  const electionRecord = getElectionRecordQuery.data;
  const machineConfig = getMachineConfigQuery.data;
  const pollingPlaceId = getPollingPlaceIdQuery.data;
  const { enableTestDeckPrinting } = getSystemSettingsQuery.data;

  // @coverage-defer
  const showNavItems = electionRecord !== null || authType === 'system_admin';
  const navRoutes = Object.values(routeMap[authType]).filter((route) =>
    route.path === electionManagerRoutes.testDecks.path
      ? enableTestDeckPrinting
      : true
  );

  return (
    <Screen flexDirection="row">
      <LeftNav style={{ flexShrink: 0 }}>
        <Link to="/print">
          <AppLogo appName="VxPrint" />
        </Link>
        <NavList>
          {showNavItems &&
            navRoutes.map((route) => (
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
            pollingPlaceId={pollingPlaceId || undefined}
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
