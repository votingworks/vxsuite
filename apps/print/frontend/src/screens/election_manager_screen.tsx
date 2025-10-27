import { ElectionDefinition } from '@votingworks/types';
import { P, H1, Button } from '@votingworks/ui';
import { Redirect, Route, Switch } from 'react-router-dom';
import {
  electionManagerRoutes,
  ElectionManagerWrapper,
} from '../components/election_manager_wrapper';
import { PrintScreen } from './print_screen';
import { PrintScreenV2 } from './print_screen_v2';
import { PrintScreenV3 } from './print_screen_v3';
import { unconfigureMachine } from '../api';

export interface ElectionManagerScreenProps {
  electionDefinition: ElectionDefinition;
}

export function ElectionManagerPrintScreen({
  electionDefinition,
}: ElectionManagerScreenProps): JSX.Element | null {
  return (
    <ElectionManagerWrapper
      electionDefinition={electionDefinition}
      title="Print"
    >
      <PrintScreen electionDefinition={electionDefinition} />
    </ElectionManagerWrapper>
  );
}

export function ElectionManagerPrintV2Screen({
  electionDefinition,
}: ElectionManagerScreenProps): JSX.Element | null {
  return (
    <ElectionManagerWrapper
      electionDefinition={electionDefinition}
      title="Print"
    >
      <PrintScreenV2 electionDefinition={electionDefinition} />
    </ElectionManagerWrapper>
  );
}

export function ElectionManagerPrintV3Screen({
  electionDefinition,
}: ElectionManagerScreenProps): JSX.Element | null {
  return (
    <ElectionManagerWrapper
      electionDefinition={electionDefinition}
      title="Print"
    >
      <PrintScreenV3 electionDefinition={electionDefinition} />
    </ElectionManagerWrapper>
  );
}

function ElectionManagerElectionScreen({
  electionDefinition,
}: ElectionManagerScreenProps): JSX.Element | null {
  const { election } = electionDefinition;

  return (
    <ElectionManagerWrapper
      electionDefinition={electionDefinition}
      title="Election"
      centerChild
    >
      <H1>Election Manager</H1>
      <P>{election.title}</P>{' '}
    </ElectionManagerWrapper>
  );
}

function ElectionManagerSettingsScreen({
  electionDefinition,
}: ElectionManagerScreenProps): JSX.Element {
  const unconfigureMachineMutation = unconfigureMachine.useMutation();
  return (
    <ElectionManagerWrapper
      electionDefinition={electionDefinition}
      title="Settings"
    >
      <Button onPress={unconfigureMachineMutation.mutate}>Unconfigure</Button>
    </ElectionManagerWrapper>
  );
}

export function ElectionManagerScreen({
  electionDefinition,
}: ElectionManagerScreenProps): JSX.Element {
  return (
    <Switch>
      <Route
        path={electionManagerRoutes.print.path}
        render={() => (
          <ElectionManagerPrintScreen electionDefinition={electionDefinition} />
        )}
      />
      <Route
        path={electionManagerRoutes.printV2.path}
        render={() => (
          <ElectionManagerPrintV2Screen
            electionDefinition={electionDefinition}
          />
        )}
      />
      <Route
        path={electionManagerRoutes.printV3.path}
        render={() => (
          <ElectionManagerPrintV3Screen
            electionDefinition={electionDefinition}
          />
        )}
      />
      <Route
        exact
        path={electionManagerRoutes.election.path}
        render={() => (
          <ElectionManagerElectionScreen
            electionDefinition={electionDefinition}
          />
        )}
      />

      <Route
        path={electionManagerRoutes.settings.path}
        render={() => (
          <ElectionManagerSettingsScreen
            electionDefinition={electionDefinition}
          />
        )}
      />
      <Redirect to={electionManagerRoutes.election.path} />
    </Switch>
  );
}
