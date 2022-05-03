import React, { useContext } from 'react';
import { useLocation } from 'react-router-dom';

import { Button, UsbControllerButton, ElectionInfoBar } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

import { routerPaths } from '../router_paths';
import { Screen } from './screen';
import { Main, MainChild } from './main';
import { Navigation } from './navigation';
import { LinkButton } from './link_button';

interface Props {
  children: React.ReactNode;
  mainChildCenter?: boolean;
  mainChildFlex?: boolean;
}

export function NavigationScreen({
  children,
  mainChildCenter = false,
  mainChildFlex = false,
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
  const currentUser = currentUserSession?.type ?? 'unknown';

  return (
    <Screen>
      <Navigation
        primaryNav={
          election ? (
            <React.Fragment>
              <LinkButton
                to={routerPaths.electionDefinition}
                className={isActiveSection(routerPaths.electionDefinition)}
              >
                Definition
              </LinkButton>
              <LinkButton
                to={routerPaths.smartcards}
                className={isActiveSection(routerPaths.smartcards)}
              >
                Cards
              </LinkButton>
              <LinkButton
                to={routerPaths.ballotsList}
                className={isActiveSection(routerPaths.ballotsList)}
              >
                Ballots
              </LinkButton>
              <LinkButton
                to={routerPaths.logicAndAccuracy}
                className={isActiveSection(routerPaths.logicAndAccuracy)}
              >
                L&amp;A
              </LinkButton>
              <LinkButton
                small
                to={routerPaths.writeIns}
                className={isActiveSection(routerPaths.writeIns)}
              >
                Write-Ins
              </LinkButton>
              <LinkButton
                small
                to={routerPaths.tally}
                className={isActiveSection(routerPaths.tally)}
              >
                Tally
              </LinkButton>
              <LinkButton
                small
                to={routerPaths.advanced}
                className={isActiveSection(routerPaths.advanced)}
              >
                Advanced
              </LinkButton>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <LinkButton
                to={routerPaths.root}
                className={isActiveSection(routerPaths.root)}
              >
                Configure
              </LinkButton>
              <LinkButton
                small
                to={routerPaths.advanced}
                className={isActiveSection(routerPaths.advanced)}
              >
                Advanced
              </LinkButton>
            </React.Fragment>
          )
        }
        secondaryNav={
          <React.Fragment>
            {!machineConfig.bypassAuthentication && (
              <Button small onPress={lockMachine}>
                Lock Machine
              </Button>
            )}
            <UsbControllerButton
              usbDriveEject={() => usbDriveEject(currentUser)}
              usbDriveStatus={usbDriveStatus}
            />
          </React.Fragment>
        }
      />
      <Main padded>
        <MainChild center={mainChildCenter} flexContainer={mainChildFlex}>
          {children}
        </MainChild>
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
