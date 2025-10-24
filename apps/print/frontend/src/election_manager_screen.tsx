import { P, Main, Screen, H1, Button } from '@votingworks/ui';
import React from 'react';
import {
  getAuthStatus,
  getElectionDefinition,
  unconfigureMachine,
} from './api';

export function ElectionManagerScreen(): JSX.Element | null {
  const authStatusQuery = getAuthStatus.useQuery();
  const getElectionDefinitionQuery = getElectionDefinition.useQuery();
  const unconfigureMachineMutation = unconfigureMachine.useMutation();
  const unconfigureMachineMutateFn = unconfigureMachineMutation.mutate;

  if (!authStatusQuery.isSuccess || !getElectionDefinitionQuery.isSuccess) {
    return null;
  }

  const electionDefinition = getElectionDefinitionQuery.data;

  return (
    <Screen>
      <Main centerChild>
        <H1>Election Manager</H1>
        {electionDefinition ? (
          <React.Fragment>
            <P>{electionDefinition.election.title}</P>
            <Button onPress={unconfigureMachineMutateFn}>
              Unconfigure Election
            </Button>
          </React.Fragment>
        ) : (
          <P>No election found</P>
        )}
      </Main>
    </Screen>
  );
}
