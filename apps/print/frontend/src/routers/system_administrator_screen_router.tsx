import { ElectionDefinition } from '@votingworks/types';
import { Redirect, Route, Switch } from 'react-router-dom';
import { Button, P } from '@votingworks/ui';
import { unconfigureMachine } from '../api';
import {
  systemAdministratorRoutes,
  SystemAdministratorWrapper,
} from '../wrappers/system_admin_wrapper';

interface SystemAdministratorSettingsScreenProps
  extends SystemAdministratorScreenProps {}

function SystemAdministratorSettingsScreen({
  electionDefinition,
}: SystemAdministratorSettingsScreenProps): JSX.Element | null {
  const unconfigureMachineMutation = unconfigureMachine.useMutation();

  return (
    <SystemAdministratorWrapper
      electionDefinition={electionDefinition}
      title="Settings"
    >
      {electionDefinition ? (
        <Button onPress={unconfigureMachineMutation.mutate}>Unconfigure</Button>
      ) : (
        <P>No election configured</P>
      )}
    </SystemAdministratorWrapper>
  );
}

export interface SystemAdministratorScreenProps {
  electionDefinition: ElectionDefinition | null;
}

export function SystemAdministratorScreen({
  electionDefinition,
}: SystemAdministratorScreenProps): JSX.Element {
  return (
    <Switch>
      <Route
        path={systemAdministratorRoutes.settings.path}
        render={() => (
          <SystemAdministratorSettingsScreen
            electionDefinition={electionDefinition}
          />
        )}
      />
      <Redirect to={systemAdministratorRoutes.settings.path} />
    </Switch>
  );
}
