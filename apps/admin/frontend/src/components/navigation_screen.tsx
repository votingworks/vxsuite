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

import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import { logOut } from '../api';
import { ScreenHeader } from './layout/screen_header';
import { NavItem, Sidebar } from './layout/sidebar';
import { MainContent } from './layout/main_content';

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
  { label: 'Ballots', routerPath: routerPaths.ballotsList },
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
]);

const ELECTION_MANAGER_NAV_ITEMS_NO_ELECTION: readonly NavItem[] = [];

const ScreenBody = styled.div`
  display: flex;
  flex-grow: 1;
  overflow: hidden;
`;

export function NavigationScreen({
  children,
  centerChild,
  flexColumn,
  flexRow,
  title,
  titleCaption,
}: Props): JSX.Element {
  const { electionDefinition, usbDrive, auth } = useContext(AppContext);
  const election = electionDefinition?.election;
  const logOutMutation = logOut.useMutation();

  const primaryNavItems: readonly NavItem[] = isSystemAdministratorAuth(auth)
    ? election
      ? SYSTEM_ADMIN_NAV_ITEMS
      : SYSTEM_ADMIN_NAV_ITEMS_NO_ELECTION
    : isElectionManagerAuth(auth)
    ? election
      ? ELECTION_MANAGER_NAV_ITEMS
      : ELECTION_MANAGER_NAV_ITEMS_NO_ELECTION
    : [];

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
                  usbDriveEject={() => usbDrive.eject(auth.user.role)}
                  usbDriveStatus={usbDrive.status}
                />
              </React.Fragment>
            )}
          </React.Fragment>
        }
      />
      <ScreenBody>
        <Sidebar navItems={primaryNavItems} />
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
