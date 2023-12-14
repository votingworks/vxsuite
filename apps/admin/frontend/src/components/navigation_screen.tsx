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
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';

import { DippedSmartCardAuth, Election } from '@votingworks/types';
import styled from 'styled-components';
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import { ejectUsbDrive, logOut } from '../api';
import { NavItem, Sidebar } from './sidebar';
import { canViewAndPrintBallots } from '../utils/can_view_and_print_ballots';

interface Props {
  children: React.ReactNode;
  title?: string;
  parentRoutes?: Route[];
}

const SYSTEM_ADMIN_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Election', routerPath: routerPaths.election },
  { label: 'Smartcards', routerPath: routerPaths.smartcards },
  { label: 'Settings', routerPath: routerPaths.settings },
];

const SYSTEM_ADMIN_NAV_ITEMS_NO_ELECTION: readonly NavItem[] = [
  { label: 'Election', routerPath: routerPaths.election },
  { label: 'Settings', routerPath: routerPaths.settings },
];

const ELECTION_MANAGER_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Election', routerPath: routerPaths.election },
  { label: 'L&A', routerPath: routerPaths.logicAndAccuracy },
  { label: 'Tally', routerPath: routerPaths.tally },
  ...(isFeatureFlagEnabled(BooleanEnvironmentVariableName.WRITE_IN_ADJUDICATION)
    ? [{ label: 'Write-Ins', routerPath: routerPaths.writeIns }]
    : []),
  { label: 'Reports', routerPath: routerPaths.reports },
  { label: 'Settings', routerPath: routerPaths.settings },
];

const NO_BALLOT_GENERATION_HIDDEN_PATHS: ReadonlySet<string> = new Set([
  routerPaths.logicAndAccuracy,
]);

const ELECTION_MANAGER_NAV_ITEMS_NO_BALLOT_GENERATION: readonly NavItem[] =
  ELECTION_MANAGER_NAV_ITEMS.filter(
    (item) => !NO_BALLOT_GENERATION_HIDDEN_PATHS.has(item.routerPath)
  );

const ELECTION_MANAGER_NAV_ITEMS_NO_ELECTION: readonly NavItem[] = [];

function getSysAdminNavItems(election?: Election) {
  if (!election) {
    return SYSTEM_ADMIN_NAV_ITEMS_NO_ELECTION;
  }

  return SYSTEM_ADMIN_NAV_ITEMS;
}

function getElectionManagerNavItems(election?: Election) {
  if (!election) {
    return ELECTION_MANAGER_NAV_ITEMS_NO_ELECTION;
  }

  if (!canViewAndPrintBallots(election)) {
    return ELECTION_MANAGER_NAV_ITEMS_NO_BALLOT_GENERATION;
  }

  return ELECTION_MANAGER_NAV_ITEMS;
}

function getNavItems(
  auth: DippedSmartCardAuth.AuthStatus,
  election?: Election
) {
  if (isSystemAdministratorAuth(auth)) {
    return getSysAdminNavItems(election);
  }

  if (isElectionManagerAuth(auth)) {
    return getElectionManagerNavItems(election);
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
}: Props): JSX.Element {
  const { electionDefinition, usbDriveStatus, auth } = useContext(AppContext);
  const election = electionDefinition?.election;
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();

  return (
    <Screen flexDirection="row">
      <Sidebar navItems={getNavItems(auth, election)} />
      <Main flexColumn>
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
