import React, { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Button,
  ElectionInfoBar,
  isAdminAuth,
  isSuperadminAuth,
  Main,
  Screen,
  UsbControllerButton,
} from '@votingworks/ui';
import {
  areVvsg2AuthFlowsEnabled,
  isWriteInAdjudicationEnabled,
} from '../config/features';
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

  const {
    electionDefinition,
    usbDriveEject,
    usbDriveStatus,
    machineConfig,
    auth,
  } = useContext(AppContext);
  const election = electionDefinition?.election;

  let primaryNavItems: NavItem[] = [];
  if (isSuperadminAuth(auth)) {
    primaryNavItems = election
      ? [
          { label: 'Definition', routerPath: routerPaths.electionDefinition },
          { label: 'Draft Ballots', routerPath: routerPaths.ballotsList },
          { label: 'Smartcards', routerPath: routerPaths.smartcards },
        ]
      : [{ label: 'Definition', routerPath: routerPaths.electionDefinition }];
  } else if (isAdminAuth(auth)) {
    let primaryNavItemsUnfiltered: Array<NavItem | false> = [];
    if (areVvsg2AuthFlowsEnabled()) {
      primaryNavItemsUnfiltered = election
        ? [
            { label: 'Ballots', routerPath: routerPaths.ballotsList },
            { label: 'L&A', routerPath: routerPaths.logicAndAccuracy },
            isWriteInAdjudicationEnabled() && {
              label: 'Write-Ins',
              routerPath: routerPaths.writeIns,
            },
            { label: 'Tally', routerPath: routerPaths.tally },
          ]
        : [];
    } else {
      primaryNavItemsUnfiltered = election
        ? [
            { label: 'Definition', routerPath: routerPaths.electionDefinition },
            { label: 'Smartcards', routerPath: routerPaths.smartcards },
            { label: 'Ballots', routerPath: routerPaths.ballotsList },
            { label: 'L&A', routerPath: routerPaths.logicAndAccuracy },
            isWriteInAdjudicationEnabled() && {
              label: 'Write-Ins',
              routerPath: routerPaths.writeIns,
            },
            { label: 'Tally', routerPath: routerPaths.tally },
            { label: 'Advanced', routerPath: routerPaths.advanced },
          ]
        : [
            { label: 'Configure', routerPath: routerPaths.root },
            { label: 'Advanced', routerPath: routerPaths.advanced },
          ];
    }
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
            {isSuperadminAuth(auth) && (
              <React.Fragment>
                <LinkButton small to={routerPaths.settings}>
                  Settings
                </LinkButton>
                <LinkButton small to={routerPaths.logs}>
                  Logs
                </LinkButton>
              </React.Fragment>
            )}
            {(isSuperadminAuth(auth) || isAdminAuth(auth)) && (
              <React.Fragment>
                <Button onPress={() => auth.logOut()} small>
                  Lock Machine
                </Button>
                <UsbControllerButton
                  usbDriveEject={() => usbDriveEject(auth.user.role)}
                  usbDriveStatus={usbDriveStatus}
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
      <ElectionInfoBar
        mode="admin"
        electionDefinition={electionDefinition}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
      />
    </Screen>
  );
}
