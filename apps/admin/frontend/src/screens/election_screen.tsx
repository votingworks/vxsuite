import React, { useContext } from 'react';

import {
  format,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';

import { Font, P, UnconfigureMachineButton } from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';
import { ExportElectionPackageModalButton } from '../components/export_election_package_modal_button';
import { unconfigure } from '../api';
import { routerPaths } from '../router_paths';
import { ElectionCard } from '../components/election_card';

export function ElectionScreen(): JSX.Element {
  const { electionDefinition, configuredAt, auth } = useContext(AppContext);
  const history = useHistory();
  const unconfigureMutation = unconfigure.useMutation();

  assert(electionDefinition && typeof configuredAt === 'string');
  const { election } = electionDefinition;

  async function unconfigureMachine() {
    try {
      await unconfigureMutation.mutateAsync();
      history.push(routerPaths.root);
    } catch (e) {
      // Handled by default query client error handling
    }
  }

  return (
    <NavigationScreen title="Election">
      <P>
        Configured with the current election at{' '}
        <Font weight="bold">
          {format.localeLongDateAndTime(new Date(configuredAt))}
        </Font>
        .
      </P>
      <ElectionCard election={election} />
      {isSystemAdministratorAuth(auth) && (
        <UnconfigureMachineButton
          isMachineConfigured
          unconfigureMachine={unconfigureMachine}
        />
      )}
      {isElectionManagerAuth(auth) && (
        <React.Fragment>
          <P>
            Save the election package to the USB drive to configure VxSuite
            components.
          </P>
          <P>
            <ExportElectionPackageModalButton />
          </P>
        </React.Fragment>
      )}
    </NavigationScreen>
  );
}
