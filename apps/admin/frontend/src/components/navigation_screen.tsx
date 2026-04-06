import React, { useContext } from 'react';

import {
  BatteryStatus,
  Button,
  DateTimeDisplay,
  IconName,
  Icons,
  Toolbar,
  LockMachineButton,
  MainHeader,
  MainContent,
  Screen,
  SessionTimeLimitTimer,
  Main,
  H1,
  Route,
  Breadcrumbs,
} from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
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
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import {
  sharedEjectUsbDrive,
  sharedLogOut,
  systemCallApi,
} from '../shared_api';
import { getNetworkStatus } from '../api';
import { NavItem, Sidebar } from './sidebar';

const Row = styled.div`
  display: flex;
  flex-direction: row;
  gap: 0.25rem;
  align-items: center;
`;

function NetworkStatusIndicator(): JSX.Element | null {
  const networkStatusQuery = getNetworkStatus.useQuery();
  if (!networkStatusQuery.isSuccess) return null;

  const { isOnline } = networkStatusQuery.data;

  return (
    <Row>
      <Icons.Antenna color="inverse" />
      {isOnline ? (
        'Network Online'
      ) : (
        <React.Fragment>
          <Icons.Warning color="inverseWarning" /> Network Offline
        </React.Fragment>
      )}
    </Row>
  );
}

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
    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(machineMode);
  }
}

const ToolbarButton = styled(Button)`
  font-size: 0.8rem;
  padding: 0.25rem 0.75rem;
`;

type ExtendedUsbDriveStatus = UsbDriveStatus['status'] | 'ejecting';
const USB_BUTTON_ICON_AND_TEXT: Record<
  ExtendedUsbDriveStatus,
  [IconName, string]
> = {
  no_drive: ['Disabled', 'No USB'],
  error: ['Disabled', 'No USB'],
  mounted: ['Eject', 'Eject USB'],
  ejecting: ['Eject', 'Ejecting...'],
  ejected: ['Disabled', 'USB Ejected'],
};

function UsbEjectButton({
  usbDriveStatus,
  onEject,
  isEjecting,
}: {
  usbDriveStatus: UsbDriveStatus;
  onEject: () => void;
  isEjecting: boolean;
}): JSX.Element {
  const extendedStatus: ExtendedUsbDriveStatus = isEjecting
    ? 'ejecting'
    : usbDriveStatus.status;
  const [icon, text] = USB_BUTTON_ICON_AND_TEXT[extendedStatus];
  return (
    <ToolbarButton
      icon={icon}
      onPress={onEject}
      color="inverseNeutral"
      disabled={extendedStatus !== 'mounted' || isEjecting}
    >
      {text}
    </ToolbarButton>
  );
}

export const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  padding-left: 0.75rem;
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
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const isMultiStationEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );

  return (
    <Screen flexDirection="row">
      <Sidebar navItems={getNavItems(machineMode, auth)} />
      <Main flexColumn>
        {shouldShowToolbar(machineMode, auth) && (
          <Toolbar>
            {machineMode === 'host' && isMultiStationEnabled && (
              <NetworkStatusIndicator />
            )}
            {batteryInfoQuery.isSuccess && batteryInfoQuery.data && (
              <BatteryStatus batteryInfo={batteryInfoQuery.data} />
            )}
            <DateTimeDisplay />
            <UsbEjectButton
              usbDriveStatus={usbDriveStatus}
              onEject={() => ejectUsbDriveMutation.mutate()}
              isEjecting={ejectUsbDriveMutation.isLoading}
            />
            <LockMachineButton onLock={() => logOutMutation.mutate()} />
          </Toolbar>
        )}
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
        </Header>
        <MainContent style={{ padding: noPadding ? 0 : undefined }}>
          {children}
        </MainContent>
      </Main>
    </Screen>
  );
}
