import {
  AppLogo,
  Button,
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
import { useRouteMatch } from 'react-router-dom';
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

const TestModeCallout = styled.div`
  background: ${(p) => p.theme.colors.warningContainer};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.warningAccent};
  font-size: ${(p) => p.theme.sizes.headingsRem.h3}rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  padding: 0.5rem 1rem;
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
        <AppLogo appName="VxCentralScan" />
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
          {isTestMode && (
            <TestModeCallout>
              <Icons.Warning color="warning" /> Machine is in Test Ballot Mode
            </TestModeCallout>
          )}
          <HeaderActions>
            <SessionTimeLimitTimer authStatus={auth} />
            {(isSystemAdministratorAuth(auth) ||
              isElectionManagerAuth(auth)) && (
              /* TODO test mode */
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
