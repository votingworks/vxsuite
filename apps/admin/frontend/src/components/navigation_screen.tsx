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
  isPollWorkerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';

import type { MachineMode } from '@votingworks/admin-backend';
import { DippedSmartCardAuth } from '@votingworks/types';
import { throwIllegalValue, assert } from '@votingworks/basics';
import styled from 'styled-components';
import { AppContext } from '../contexts/app_context.js';
import { routerPaths } from '../router_paths.js';
import { sharedEjectUsbDrive, sharedLogOut } from '../shared_api.js';
import { NavItem, Sidebar } from './sidebar.js';

interface Props {
  children: React.ReactNode;
  title?: string;
  parentRoutes?: Route[];
  noPadding?: boolean;
}

const HOST_SYSTEM_ADMIN_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Election', routerPath: routerPaths.election },
  { label: 'Smart Cards', routerPath: routerPaths.smartcards },
  { label: 'Settings', routerPath: routerPaths.settings },
  { label: 'Diagnostics', routerPath: routerPaths.hardwareDiagnostics },
];

const HOST_ELECTION_MANAGER_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Election', routerPath: routerPaths.election },
  { label: 'Tally', routerPath: routerPaths.tally },
  ...(isFeatureFlagEnabled(BooleanEnvironmentVariableName.WRITE_IN_ADJUDICATION)
    ? [{ label: 'Adjudication', routerPath: routerPaths.adjudication }]
    : []),
  { label: 'Reports', routerPath: routerPaths.reports },
  { label: 'Settings', routerPath: routerPaths.settings },
  { label: 'Diagnostics', routerPath: routerPaths.hardwareDiagnostics },
];

const CLIENT_SYSTEM_ADMIN_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Settings', routerPath: routerPaths.settings },
  { label: 'Diagnostics', routerPath: routerPaths.hardwareDiagnostics },
];

const CLIENT_ELECTION_MANAGER_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Adjudication', routerPath: routerPaths.adjudication },
  { label: 'Settings', routerPath: routerPaths.settings },
  { label: 'Diagnostics', routerPath: routerPaths.hardwareDiagnostics },
];

const CLIENT_POLL_WORKER_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Adjudication', routerPath: routerPaths.adjudication },
];

function getNavItems(
  machineMode: MachineMode,
  auth: DippedSmartCardAuth.AuthStatus
): readonly NavItem[] {
  switch (machineMode) {
    case 'host': {
      if (isSystemAdministratorAuth(auth)) {
        return HOST_SYSTEM_ADMIN_NAV_ITEMS;
      }
      assert(isElectionManagerAuth(auth));
      return HOST_ELECTION_MANAGER_NAV_ITEMS;
    }
    case 'client': {
      if (isSystemAdministratorAuth(auth)) {
        return CLIENT_SYSTEM_ADMIN_NAV_ITEMS;
      }
      if (isElectionManagerAuth(auth)) {
        return CLIENT_ELECTION_MANAGER_NAV_ITEMS;
      }
      assert(isPollWorkerAuth(auth));
      return CLIENT_POLL_WORKER_NAV_ITEMS;
    }
    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(machineMode);
  }
}

function shouldShowHeaderActions(
  machineMode: MachineMode,
  auth: DippedSmartCardAuth.AuthStatus
): boolean {
  switch (machineMode) {
    case 'host':
      return isSystemAdministratorAuth(auth) || isElectionManagerAuth(auth);
    case 'client':
      return (
        isSystemAdministratorAuth(auth) ||
        isElectionManagerAuth(auth) ||
        isPollWorkerAuth(auth)
      );
    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(machineMode);
  }
}

export const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 0.75rem;
  gap: 0.5rem;
`;

export const HeaderActions = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-shrink: 0;
`;

export function NavigationScreen({
  children,
  title,
  parentRoutes,
  noPadding,
}: Props): JSX.Element {
  const { usbDriveStatus, auth, machineMode } = useContext(AppContext);
  const logOutMutation = sharedLogOut.useMutation();
  const ejectUsbDriveMutation = sharedEjectUsbDrive.useMutation();

  return (
    <Screen flexDirection="row">
      <Sidebar navItems={getNavItems(machineMode, auth)} />
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
            {shouldShowHeaderActions(machineMode, auth) && (
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
