import React, { useContext, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Button,
  ElectionInfoBar,
  Main,
  Screen,
  UsbControllerButton,
} from '@votingworks/ui';

import {
  areVvsg2AuthFlowsEnabled,
  isAuthenticationEnabled,
  isWriteInAdjudicationEnabled,
} from '../config/features';
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import { Navigation } from './navigation';
import { LinkButton } from './link_button';
import { LogsModal } from './logs_modal';
import { SettingsModal } from './settings_modal';

interface NavItem {
  label: string;
  routerPath: string;
}

interface Props {
  children: React.ReactNode;
  centerChild?: boolean;
  flexColumn?: boolean;
}

export function NavigationScreen({
  children,
  centerChild,
  flexColumn,
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
    lockMachine,
    machineConfig,
    currentUserSession,
  } = useContext(AppContext);
  const election = electionDefinition?.election;
  const currentUserType = currentUserSession?.type ?? 'unknown';

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);

  let primaryNavItems: NavItem[] = [];
  if (currentUserType === 'superadmin') {
    primaryNavItems = election
      ? [
          { label: 'Definition', routerPath: routerPaths.electionDefinition },
          { label: 'Draft Ballots', routerPath: routerPaths.ballotsList },
          { label: 'Smartcards', routerPath: routerPaths.smartcards },
          { label: 'Backups', routerPath: routerPaths.backups },
        ]
      : [
          { label: 'Definition', routerPath: routerPaths.electionDefinition },
          { label: 'Backups', routerPath: routerPaths.backups },
        ];
  } else if (currentUserType === 'admin') {
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
            {currentUserType === 'superadmin' && (
              <React.Fragment>
                <Button onPress={() => setShowSettingsModal(true)} small>
                  Settings
                </Button>
                <Button onPress={() => setShowLogsModal(true)} small>
                  Logs
                </Button>
                {showSettingsModal && (
                  <SettingsModal
                    closeModal={() => setShowSettingsModal(false)}
                  />
                )}
                {showLogsModal && (
                  <LogsModal closeModal={() => setShowLogsModal(false)} />
                )}
              </React.Fragment>
            )}
            {isAuthenticationEnabled() && (
              <Button onPress={lockMachine} small>
                Lock Machine
              </Button>
            )}
            <UsbControllerButton
              usbDriveEject={() => usbDriveEject(currentUserType)}
              usbDriveStatus={usbDriveStatus}
            />
          </React.Fragment>
        }
      />
      <Main padded centerChild={centerChild} flexColumn={flexColumn}>
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
