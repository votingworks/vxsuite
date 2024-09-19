import React, { useContext } from 'react';

import {
  Button,
  MainHeader,
  MainContent,
  Screen,
  SessionTimeLimitTimer,
  UsbControllerButton,
  Main,
  H1,
  Route,
  Breadcrumbs,
  BatteryDisplay,
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';

import { DippedSmartCardAuth } from '@votingworks/types';
import styled from 'styled-components';
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import { ejectUsbDrive, logOut } from '../api';
import { NavItem, Sidebar } from './sidebar';

interface Props {
  children: React.ReactNode;
  title?: string;
  parentRoutes?: Route[];
  noPadding?: boolean;
}

const SYSTEM_ADMIN_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Election', routerPath: routerPaths.election },
  { label: 'Smart Cards', routerPath: routerPaths.smartcards },
  { label: 'Settings', routerPath: routerPaths.settings },
  { label: 'Diagnostics', routerPath: routerPaths.hardwareDiagnostics },
];

const ELECTION_MANAGER_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Election', routerPath: routerPaths.election },
  { label: 'Tally', routerPath: routerPaths.tally },
  ...(isFeatureFlagEnabled(BooleanEnvironmentVariableName.WRITE_IN_ADJUDICATION)
    ? [{ label: 'Write-Ins', routerPath: routerPaths.writeIns }]
    : []),
  { label: 'Reports', routerPath: routerPaths.reports },
  { label: 'Settings', routerPath: routerPaths.settings },
  { label: 'Diagnostics', routerPath: routerPaths.hardwareDiagnostics },
];

function getNavItems(auth: DippedSmartCardAuth.AuthStatus) {
  if (isSystemAdministratorAuth(auth)) {
    return SYSTEM_ADMIN_NAV_ITEMS;
  }

  if (isElectionManagerAuth(auth)) {
    return ELECTION_MANAGER_NAV_ITEMS;
  }

  return [];
}

export const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 0.75rem;
`;

export const HeaderActions = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

export function NavigationScreen({
  children,
  title,
  parentRoutes,
  noPadding,
}: Props): JSX.Element {
  const { usbDriveStatus, auth } = useContext(AppContext);
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();

  return (
    <Screen flexDirection="row">
      <Sidebar navItems={getNavItems(auth)} />
      <Main flexColumn>
        <SessionTimeLimitTimer authStatus={auth} />
        <Header>
          <div>
            {title && (
              <React.Fragment>
                {parentRoutes && (
                  <Breadcrumbs
                    currentTitle={title}
                    parentRoutes={parentRoutes}
                  />
                )}
                <H1>{title}</H1>
              </React.Fragment>
            )}
          </div>
          <HeaderActions>
            {(isSystemAdministratorAuth(auth) ||
              isElectionManagerAuth(auth)) && (
              <React.Fragment>
                <UsbControllerButton
                  usbDriveEject={() => ejectUsbDriveMutation.mutate()}
                  usbDriveStatus={usbDriveStatus}
                  usbDriveIsEjecting={ejectUsbDriveMutation.isLoading}
                />
                <Button onPress={() => logOutMutation.mutate()} icon="Lock">
                  Lock Machine
                </Button>
                <BatteryDisplay />
              </React.Fragment>
            )}
          </HeaderActions>
        </Header>
        <MainContent style={{ padding: noPadding ? 0 : undefined }}>
          {children}
        </MainContent>
      </Main>
    </Screen>
  );
}
