import { H1, InsertCardImage, Main, Screen } from '@votingworks/ui';
import React from 'react';
import { getElectionRecord } from '../api';

export function MachineLockedScreen(): JSX.Element | null {
  const getElectionRecordQuery = getElectionRecord.useQuery();

  if (!getElectionRecordQuery.isSuccess) {
    return null;
  }

  const electionRecord = getElectionRecordQuery.data;
  return (
    <Screen>
      <Main centerChild>
        <React.Fragment>
          <InsertCardImage cardInsertionDirection="right" />
          <H1 align="center" style={{ maxWidth: '50rem' }}>
            {electionRecord
              ? 'Insert a card to unlock'
              : 'Insert an election manager card to configure VxPrint'}
          </H1>
        </React.Fragment>
      </Main>
    </Screen>
  );
}
