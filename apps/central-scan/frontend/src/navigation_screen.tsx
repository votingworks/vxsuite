import {
  AppLogo,
  BatteryStatus,
  DateTimeDisplay,
  H1,
  LeftNav,
  LockMachineButton,
  Main,
  MainContent,
  MainHeader,
  NavLink,
  NavList,
  NavListItem,
  Screen,
  SessionTimeLimitTimer,
  TestModeBanner,
  Toolbar,
  UsbEjectButton,
  VerticalElectionInfoBar,
} from '@votingworks/ui';
import styled from 'styled-components';
import React, { useContext } from 'react';
import {
  isSystemAdministratorAuth,
  isElectionManagerAuth,
} from '@votingworks/utils';
import { DippedSmartCardAuth, ElectionDefinition } from '@votingworks/types';
import { Link, useRouteMatch } from 'react-router-dom';
import { AppContext } from './contexts/app_context.js';
import { ejectUsbDrive, logOut, systemCallApi } from './api.js';
import { NetworkStatusIndicator } from './components/network_status_indicator.js';

interface Props {
  children: React.ReactNode;
  title?: React.ReactNode;
}

export const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

// Because the VxCentralScan is such a long app name, we have to resize the app
// name and logo image to fit in the left nav
const CentralScanAppLogo = styled(AppLogo)`
  margin-top: 0.25rem;

  svg {
    height: 2rem;
    width: 2rem;
  }

  span {
    font-size: ${(p) => p.theme.sizes.headingsRem.h3}rem;
  }
`;

const SYSTEM_ADMIN_NAV_ITEMS = [
  { label: 'Settings', routerPath: '/system-administrator-settings' },
  { label: 'Diagnostics', routerPath: '/hardware-diagnostics' },
] as const;

const ELECTION_MANAGER_NAV_ITEMS = [
  { label: 'Scan Ballots', routerPath: '/scan' },
  { label: 'Settings', routerPath: '/settings' },
  { label: 'Diagnostics', routerPath: '/hardware-diagnostics' },
] as const;

function getNavItems(
  auth: DippedSmartCardAuth.AuthStatus,
  electionDefinition?: ElectionDefinition
) {
  if (isSystemAdministratorAuth(auth)) {
    return SYSTEM_ADMIN_NAV_ITEMS;
  }

  if (isElectionManagerAuth(auth) && electionDefinition) {
    return ELECTION_MANAGER_NAV_ITEMS;
  }

  return [];
}

function NavigationToolbar(): JSX.Element {
  const { usbDriveStatus } = useContext(AppContext);
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();

  return (
    <Toolbar>
      <NetworkStatusIndicator />
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
  );
}

export function NavigationScreen({ children, title }: Props): JSX.Element {
  const {
    electionDefinition,
    electionPackageHash,
    isTestMode,
    machineConfig,
    auth,
  } = useContext(AppContext);
  const currentRoute = useRouteMatch();
  const navItems = getNavItems(auth, electionDefinition);
  const showToolbar =
    isSystemAdministratorAuth(auth) || isElectionManagerAuth(auth);

  function isActivePath(path: string): boolean {
    return currentRoute.path.startsWith(path);
  }

  return (
    <Screen flexDirection="row">
      <LeftNav>
        <Link to="/">
          <CentralScanAppLogo appName="VxCentralScan" />
        </Link>
        <NavList>
          {navItems.map(({ label, routerPath }) => (
            <NavListItem key={routerPath}>
              <NavLink to={routerPath} isActive={isActivePath(routerPath)}>
                {label}
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
      <Main flexColumn>
        {showToolbar && <NavigationToolbar />}
        <SessionTimeLimitTimer authStatus={auth} />
        {isTestMode && isElectionManagerAuth(auth) && electionDefinition && (
          <TestModeBanner />
        )}
        <Header>
          <H1>{title}</H1>
        </Header>
        <MainContent>{children}</MainContent>
      </Main>
    </Screen>
  );
}
