import React, { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Button,
  ElectionInfoBar,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  Main,
  Screen,
  UsbControllerButton,
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import { Navigation } from './navigation';
import { LinkButton } from './link_button';

interface NavItem {
  label: string;
  routerPath: string;
}

interface Props {
  children: React.ReactNode;
  centerChild?: boolean;
  flexColumn?: boolean;
  flexRow?: boolean;
}

export function NavigationScreen({
  children,
  centerChild,
  flexColumn,
  flexRow,
}: Props): JSX.Element {
  const location = useLocation();

  function isActiveSection(path: string) {
    if (path === '/') {
      return location.pathname === '/' ? 'active-section' : '';
    }
    return new RegExp(`^${path}`).test(location.pathname)
      ? 'active-section'
      : '';
  }

  const { electionDefinition, usbDrive, machineConfig, auth } =
    useContext(AppContext);
  const election = electionDefinition?.election;

  let primaryNavItems: NavItem[] = [];
  if (isSystemAdministratorAuth(auth)) {
    primaryNavItems = election
      ? [
          { label: 'Definition', routerPath: routerPaths.electionDefinition },
          { label: 'Ballots', routerPath: routerPaths.ballotsList },
          { label: 'Smartcards', routerPath: routerPaths.smartcards },
        ]
      : [{ label: 'Definition', routerPath: routerPaths.electionDefinition }];
  } else if (isElectionManagerAuth(auth)) {
    const primaryNavItemsUnfiltered: Array<NavItem | false> = election
      ? [
          { label: 'Ballots', routerPath: routerPaths.ballotsList },
          { label: 'L&A', routerPath: routerPaths.logicAndAccuracy },
          { label: 'Tally', routerPath: routerPaths.tally },
          isFeatureFlagEnabled(
            BooleanEnvironmentVariableName.WRITE_IN_ADJUDICATION
          ) && {
            label: 'Write-Ins',
            routerPath: routerPaths.writeIns,
          },
          { label: 'Reports', routerPath: routerPaths.reports },
        ]
      : [];
    primaryNavItems = primaryNavItemsUnfiltered.filter<NavItem>(
      (entry): entry is NavItem => Boolean(entry)
    );
  }

  return (
    <Screen>
      <Navigation
        primaryNav={
          <React.Fragment>
            {primaryNavItems.map(({ label, routerPath }) => (
              <LinkButton
                className={isActiveSection(routerPath)}
                to={routerPath}
                key={label}
              >
                {label}
              </LinkButton>
            ))}
          </React.Fragment>
        }
        secondaryNav={
          <React.Fragment>
            {isSystemAdministratorAuth(auth) && (
              <React.Fragment>
                <LinkButton small to={routerPaths.settings}>
                  Settings
                </LinkButton>
                <LinkButton small to={routerPaths.logs}>
                  Logs
                </LinkButton>
              </React.Fragment>
            )}
            {(isSystemAdministratorAuth(auth) ||
              isElectionManagerAuth(auth)) && (
              <React.Fragment>
                <Button onPress={() => auth.logOut()} small>
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
      <Main
        padded
        centerChild={centerChild}
        flexColumn={flexColumn}
        flexRow={flexRow}
      >
        {children}
      </Main>
      {electionDefinition && (
        <ElectionInfoBar
          mode="admin"
          electionDefinition={electionDefinition}
          codeVersion={machineConfig.codeVersion}
          machineId={machineConfig.machineId}
        />
      )}
    </Screen>
  );
}
