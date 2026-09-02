import React, { useContext } from 'react';

import {
  BatteryStatus,
  DateTimeDisplay,
  HostNetworkIndicatorStatus,
  NetworkStatusIndicator as NetworkStatusIndicatorView,
  Toolbar,
  LockMachineButton,
  UsbEjectButton,
  MainHeader,
  MainContent,
  Screen,
  SessionTimeLimitTimer,
  Main,
  H1,
  Route,
  Breadcrumbs,
  ToolbarButtons,
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
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
import {
  isMultiStationAdjudicationEnabled,
  sharedEjectUsbDrive,
  sharedLogOut,
  systemCallApi,
} from '../shared_api.js';
import { getNetworkStatus } from '../api.js';
import { ClientNetworkStatusIndicator } from '../client/components/network_status_indicator.js';
import { NavItem, Sidebar } from './sidebar.js';

function NetworkStatusIndicator(): JSX.Element | null {
  const networkStatusQuery = getNetworkStatus.usePollingQuery();
  if (!networkStatusQuery.isSuccess) return null;

  const { isOnline, multipleHostsDetected } = networkStatusQuery.data;
  const status: HostNetworkIndicatorStatus = !isOnline
    ? 'no-network'
    : multipleHostsDetected
    ? 'error'
    : 'connected';
  return <NetworkStatusIndicatorView isHost status={status} />;
}

// Wrapper kept inside the host-mode branch so its query (which uses the host
// API client) never runs in client-mode renders.
function HostNetworkStatusIndicator(): JSX.Element | null {
  const isMultiStationEnabled =
    isMultiStationAdjudicationEnabled.useQuery().data ?? false;
  return isMultiStationEnabled ? <NetworkStatusIndicator /> : null;
}

interface Props {
  children: React.ReactNode;
  title?: string;
  parentRoutes?: Route[];
  noPadding?: boolean;
  style?: React.CSSProperties;
}

const HOST_SYSTEM_ADMIN_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Election', routerPath: routerPaths.election },
  { label: 'Smart Cards', routerPath: routerPaths.smartcards },
  {
    label: 'Backups',
    routerPath: routerPaths.backups,
    flag: BooleanEnvironmentVariableName.ENABLE_ADMIN_BACKUP_RESTORE,
  },
  { label: 'Settings', routerPath: routerPaths.settings },
  { label: 'Diagnostics', routerPath: routerPaths.hardwareDiagnostics },
];

const HOST_ELECTION_MANAGER_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Election', routerPath: routerPaths.election },
  { label: 'Tally', routerPath: routerPaths.tally },
  { label: 'Adjudication', routerPath: routerPaths.adjudication },
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
    default:
      throwIllegalValue(machineMode);
  }
}

function shouldShowToolbar(
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
    default:
      throwIllegalValue(machineMode);
  }
}

export const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  padding-left: 0.75rem;
`;

export interface NavScreenLiteProps {
  children: React.ReactNode;
}

export function NavScreenLite({ children }: NavScreenLiteProps): JSX.Element {
  const { usbDriveStatus, auth, machineMode } = useContext(AppContext);
  const logOutMutation = sharedLogOut.useMutation();
  const ejectUsbDriveMutation = sharedEjectUsbDrive.useMutation();
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();

  return (
    <Screen flexDirection="row">
      <Sidebar navItems={getNavItems(machineMode, auth)} />
      <Main flexColumn>
        {shouldShowToolbar(machineMode, auth) && (
          <Toolbar>
            {machineMode === 'host' && <HostNetworkStatusIndicator />}
            {machineMode === 'client' && <ClientNetworkStatusIndicator />}
            {batteryInfoQuery.isSuccess && batteryInfoQuery.data && (
              <BatteryStatus batteryInfo={batteryInfoQuery.data} />
            )}
            <DateTimeDisplay />
            <ToolbarButtons>
              <UsbEjectButton
                usbDriveStatus={usbDriveStatus}
                // @coverage-defer
                onEject={() => ejectUsbDriveMutation.mutate()}
                isEjecting={ejectUsbDriveMutation.isLoading}
              />
              <LockMachineButton onLock={() => logOutMutation.mutate()} />
            </ToolbarButtons>
          </Toolbar>
        )}
        <SessionTimeLimitTimer authStatus={auth} />
        {children}
      </Main>
    </Screen>
  );
}

export function NavigationScreen({
  children,
  title,
  parentRoutes,
  noPadding,
  style,
}: Props): JSX.Element {
  return (
    <NavScreenLite>
      <Header>
        <div>
          {title && (
            <React.Fragment>
              {parentRoutes && (
                <Breadcrumbs currentTitle={title} parentRoutes={parentRoutes} />
              )}
              <H1>{title}</H1>
            </React.Fragment>
          )}
        </div>
      </Header>
      <MainContent
        style={{
          ...(style ?? {}),
          padding: noPadding ? 0 : undefined,
        }}
      >
        {children}
      </MainContent>
    </NavScreenLite>
  );
}
