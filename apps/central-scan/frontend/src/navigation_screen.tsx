import {
  AppLogo,
  BatteryDisplay,
  Button,
  Card,
  H1,
  Icons,
  LeftNav,
  Main,
  MainContent,
  MainHeader,
  NavLink,
  NavList,
  NavListItem,
  Screen,
  SessionTimeLimitTimer,
  UsbControllerButton,
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
import { AppContext } from './contexts/app_context';
import { ejectUsbDrive, logOut } from './api';

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

const HeaderActions = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-shrink: 0;
`;

const TestModeCallout = styled(Card).attrs({ color: 'warning' })`
  font-size: ${(p) => p.theme.sizes.headingsRem.h3}rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};

  > div {
    padding: 0.5rem 1rem;
  }

  flex-shrink: 0;
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

export function NavigationScreen({ children, title }: Props): JSX.Element {
  const {
    electionDefinition,
    electionPackageHash,
    isTestMode,
    machineConfig,
    usbDriveStatus,
    auth,
  } = useContext(AppContext);
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const currentRoute = useRouteMatch();
  const navItems = getNavItems(auth, electionDefinition);

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
        <SessionTimeLimitTimer authStatus={auth} />
        <Header>
          <H1>{title}</H1>
          {isTestMode && isElectionManagerAuth(auth) && electionDefinition && (
            <TestModeCallout>
              <Icons.Warning color="warning" /> Test Ballot Mode
            </TestModeCallout>
          )}
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
        <MainContent>{children}</MainContent>
      </Main>
    </Screen>
  );
}
