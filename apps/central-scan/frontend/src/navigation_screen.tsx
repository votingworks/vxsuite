import {
  AppLogo,
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
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const TestModeCallout = styled(Card).attrs({ color: 'warning' })`
  font-size: ${(p) => p.theme.sizes.headingsRem.h3}rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};

  > div {
    padding: 0.5rem 1rem;
  }
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

export function NavigationScreen({ children, title }: Props): JSX.Element {
  const {
    electionDefinition,
    isTestMode,
    machineConfig,
    usbDriveStatus,
    auth,
  } = useContext(AppContext);
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();
  const currentRoute = useRouteMatch();

  function isActivePath(path: string): boolean {
    return currentRoute.path.startsWith(path);
  }

  return (
    <Screen flexDirection="row">
      <LeftNav>
        <Link to="/">
          <CentralScanAppLogo appName="VxCentralScan" />
        </Link>
        {isElectionManagerAuth(auth) && electionDefinition && (
          <NavList>
            <NavListItem>
              <NavLink to="/scan" isActive={isActivePath('/scan')}>
                Scan Ballots
              </NavLink>
            </NavListItem>
            <NavListItem>
              <NavLink to="/settings" isActive={isActivePath('/settings')}>
                Settings
              </NavLink>
            </NavListItem>
          </NavList>
        )}
        {electionDefinition && (
          <div style={{ marginTop: 'auto' }}>
            <VerticalElectionInfoBar
              mode="admin"
              electionDefinition={electionDefinition}
              codeVersion={machineConfig.codeVersion}
              machineId={machineConfig.machineId}
              inverse
            />
          </div>
        )}
      </LeftNav>
      <Main flexColumn>
        <Header>
          <H1>{title}</H1>
          {isTestMode && isElectionManagerAuth(auth) && electionDefinition && (
            <TestModeCallout>
              <Icons.Warning color="warning" /> Test Ballot Mode
            </TestModeCallout>
          )}
          <HeaderActions>
            <SessionTimeLimitTimer authStatus={auth} />
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
              </React.Fragment>
            )}
          </HeaderActions>
        </Header>
        <MainContent>{children}</MainContent>
      </Main>
    </Screen>
  );
}
