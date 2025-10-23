import { ElectionDefinition } from '@votingworks/types';
import { P, H1 } from '@votingworks/ui';
import { Redirect, Route, Switch } from 'react-router-dom';
import {
  electionManagerRoutes,
  ElectionManagerWrapper,
} from './components/election_manager_wrapper';

export interface ElectionManagerScreenProps {
  electionDefinition: ElectionDefinition;
}

export function ElectionManagerPrintScreen({
  electionDefinition,
}: ElectionManagerScreenProps): JSX.Element | null {
  const { election } = electionDefinition;

  return (
    <ElectionManagerWrapper electionDefinition={electionDefinition}>
      <H1>Print mode</H1>
      <P>{election.title}</P>
    </ElectionManagerWrapper>
  );
}

function ElectionManagerElectionScreen({
  electionDefinition,
}: ElectionManagerScreenProps): JSX.Element | null {
  const { election } = electionDefinition;

  return (
    <ElectionManagerWrapper electionDefinition={electionDefinition}>
      <H1>Election Manager</H1>
      <P>{election.title}</P>{' '}
    </ElectionManagerWrapper>
  );
}

function ElectionManagerSettingsScreen({
  electionDefinition,
}: ElectionManagerScreenProps): JSX.Element {
  return (
    <ElectionManagerWrapper electionDefinition={electionDefinition}>
      Settings for Election Manager
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
