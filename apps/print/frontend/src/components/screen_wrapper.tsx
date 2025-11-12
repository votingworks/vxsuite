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
import { assertDefined } from '@votingworks/basics';
import { Toolbar } from './toolbar';
import { routeMap } from '../routes';
import { getElectionRecord, getMachineConfig } from '../api';

export function ScreenWrapper({
  children,
  authType,
}: {
  children: React.ReactNode;
  authType: 'system_admin' | 'election_manager' | 'poll_worker';
}): JSX.Element | null {
  const currentRoute = useRouteMatch();
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();

  if (!getElectionRecordQuery.isSuccess || !getMachineConfigQuery.isSuccess) {
    return null;
  }

  const { electionDefinition, electionPackageHash } = assertDefined(
    getElectionRecordQuery.data
  );
  const machineConfig = getMachineConfigQuery.data;

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
            electionDefinition={electionDefinition}
            electionPackageHash={electionPackageHash}
            codeVersion={machineConfig.codeVersion}
            machineId={machineConfig.machineId}
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
