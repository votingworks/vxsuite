import { H1, InsertCardImage, Main, Screen } from '@votingworks/ui';
import React from 'react';
import { getElectionDefinition } from './api';

export function MachineLockedScreen(): JSX.Element | null {
  const getElectionDefinitionQuery = getElectionDefinition.useQuery();

  if (!getElectionDefinitionQuery.isSuccess) {
    return null;
  }

  const electionDefinition = getElectionDefinitionQuery.data;

  return (
    <Screen>
      <Main centerChild>
        <React.Fragment>
          <InsertCardImage cardInsertionDirection="right" />
          <H1 align="center" style={{ maxWidth: '36rem' }}>
            {electionDefinition
              ? 'Insert a card to unlock'
              : 'Insert a system administrator or election manager card to configure VxPrint'}
          </H1>
        </React.Fragment>
      </Main>
    </Screen>
  );
}
