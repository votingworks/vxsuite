import React, { useContext } from 'react';
import _ from 'lodash';
import styled from 'styled-components';

import {
  Button,
  Screen,
  SessionTimeLimitTimer,
  UsbControllerButton,
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';

import { DippedSmartCardAuth, Election } from '@votingworks/types';
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import { ejectUsbDrive, logOut } from '../api';
import { ScreenHeader } from './layout/screen_header';
import { NavItem, Sidebar } from './layout/sidebar';
import { MainContent } from './layout/main_content';
import { canViewAndPrintBallots } from '../utils/can_view_and_print_ballots';

interface Props {
  children: React.ReactNode;
  centerChild?: boolean;
  flexColumn?: boolean;
  flexRow?: boolean;
  title?: React.ReactNode;
  titleCaption?: React.ReactNode;
}

const SYSTEM_ADMIN_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Definition', routerPath: routerPaths.electionDefinition },
  { label: 'Smartcards', routerPath: routerPaths.smartcards },
  { label: 'Logs', routerPath: routerPaths.logs },
  { label: 'Settings', routerPath: routerPaths.settings },
];

const SYSTEM_ADMIN_NAV_ITEMS_NO_ELECTION: readonly NavItem[] = [
  { label: 'Definition', routerPath: routerPaths.electionDefinition },
  { label: 'Logs', routerPath: routerPaths.logs },
  { label: 'Settings', routerPath: routerPaths.settings },
];

const ELECTION_MANAGER_NAV_ITEMS: readonly NavItem[] = _.compact([
  { label: 'Ballots', routerPath: routerPaths.ballotsList },
  { label: 'L&A', routerPath: routerPaths.logicAndAccuracy },
  { label: 'Tally', routerPath: routerPaths.tally },
  isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.WRITE_IN_ADJUDICATION
  ) && { label: 'Write-Ins', routerPath: routerPaths.writeIns },
  { label: 'Reports', routerPath: routerPaths.reports },
  isFeatureFlagEnabled(BooleanEnvironmentVariableName.LIVECHECK) && {
    label: 'System',
    routerPath: routerPaths.system,
  },
]);

const NO_BALLOT_GENERATION_HIDDEN_PATHS: ReadonlySet<string> = new Set([
  routerPaths.logicAndAccuracy,
]);

const ELECTION_MANAGER_NAV_ITEMS_NO_BALLOT_GENERATION: readonly NavItem[] =
  ELECTION_MANAGER_NAV_ITEMS.filter(
    (item) => !NO_BALLOT_GENERATION_HIDDEN_PATHS.has(item.routerPath)
  );

const ELECTION_MANAGER_NAV_ITEMS_NO_ELECTION: readonly NavItem[] = [];

const ScreenBody = styled.div`
  display: flex;
  flex-grow: 1;
  overflow: hidden;
`;

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

export function NavigationScreen({
  children,
  centerChild,
  flexColumn,
  flexRow,
  title,
  titleCaption,
}: Props): JSX.Element {
  const { electionDefinition, usbDriveStatus, auth } = useContext(AppContext);
  const election = electionDefinition?.election;
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();

  return (
    <Screen>
      <ScreenHeader
        noBorder
        title={title}
        titleCaption={titleCaption}
        actions={
          <React.Fragment>
            <SessionTimeLimitTimer authStatus={auth} />
            {(isSystemAdministratorAuth(auth) ||
              isElectionManagerAuth(auth)) && (
              <React.Fragment>
                <Button onPress={() => logOutMutation.mutate()} small>
                  Lock Machine
                </Button>
                <UsbControllerButton
                  usbDriveEject={() => ejectUsbDriveMutation.mutate()}
                  usbDriveStatus={usbDriveStatus}
                  usbDriveIsEjecting={ejectUsbDriveMutation.isLoading}
                />
              </React.Fragment>
            )}
          </React.Fragment>
        }
      />
      <ScreenBody>
        <Sidebar navItems={getNavItems(auth, election)} />
        <MainContent
          padded
          centerChild={centerChild}
          flexColumn={flexColumn}
          flexRow={flexRow}
        >
          {children}
        </MainContent>
      </ScreenBody>
    </Screen>
  );
}
