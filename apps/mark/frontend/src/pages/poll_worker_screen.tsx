import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  PrecinctSelection,
  PollsState,
  InsertedSmartCardAuth,
} from '@votingworks/types';
import {
  Button,
  Main,
  Screen,
  ElectionInfoBar,
  TestModeBanner,
} from '@votingworks/ui';

import type { MachineConfig } from '@votingworks/mark-backend';

import { pollWorkerComponents } from '@votingworks/mark-flow-ui';
import React from 'react';
import { setPollsState, setTestMode, useApiClient } from '../api';

export interface PollworkerScreenProps {
  pollWorkerAuth: InsertedSmartCardAuth.PollWorkerLoggedIn;
  activateCardlessVoterSession: (
    precinctId: PrecinctId,
    ballotStyleId: BallotStyleId
  ) => void;
  resetCardlessVoterSession: () => void;
  appPrecinct?: PrecinctSelection;
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  hasVotes: boolean;
  isLiveMode: boolean;
  pollsState: PollsState;
  ballotsPrintedCount: number;
  machineConfig: MachineConfig;
  pollingPlaceId?: string;
}

export function PollWorkerScreen({
  pollWorkerAuth,
  activateCardlessVoterSession,
  resetCardlessVoterSession,
  appPrecinct,
  electionDefinition,
  electionPackageHash,
  isLiveMode,
  pollsState,
  ballotsPrintedCount,
  machineConfig,
  hasVotes,
  pollingPlaceId,
}: PollworkerScreenProps): JSX.Element {
  const {
    EnableLiveModeModal,
    ScreenBeginVoting,
    ScreenVotingInProgress,
    SectionHeader,
    SectionPollsState,
    SectionSessionStart,
    SectionSystem,
  } = pollWorkerComponents;

  const { election } = electionDefinition;

  const apiClient = useApiClient();
  const setPollsStateMutation = setPollsState.useMutation();
  const setTestModeMutation = setTestMode.useMutation();

  const onChooseBallotStyle = React.useCallback(
    (precinctId: PrecinctId, ballotStyleId: BallotStyleId) => {
      activateCardlessVoterSession(precinctId, ballotStyleId);
    },
    [activateCardlessVoterSession]
  );

  if (hasVotes && pollWorkerAuth.cardlessVoterUser) {
    return (
      <ScreenVotingInProgress
        election={election}
        resetVoterSessionButton={
          <Button
            variant="danger"
            icon="Delete"
            onPress={resetCardlessVoterSession}
          >
            Reset Ballot
          </Button>
        }
        voter={pollWorkerAuth.cardlessVoterUser}
      />
    );
  }

  if (pollWorkerAuth.cardlessVoterUser) {
    return (
      <ScreenBeginVoting
        election={election}
        resetVoterSessionButton={
          <Button onPress={resetCardlessVoterSession}>
            Deactivate Voting Session
          </Button>
        }
        voter={pollWorkerAuth.cardlessVoterUser}
      />
    );
  }

  return (
    <Screen>
      {!isLiveMode && <TestModeBanner />}
      <Main padded>
        <div>
          <SectionHeader ballotsPrintedCount={ballotsPrintedCount} />
          {pollsState === 'polls_open' && (
            <SectionSessionStart
              election={election}
              onChooseBallotStyle={onChooseBallotStyle}
              pollingPlaceId={pollingPlaceId}
              precinctSelection={appPrecinct}
            />
          )}
          <SectionPollsState
            pollsState={pollsState}
            updatePollsState={(newPollsState) =>
              setPollsStateMutation.mutate({
                pollsState: newPollsState,
              })
            }
          />
          <SectionSystem apiClient={apiClient} />
        </div>
      </Main>
      <EnableLiveModeModal
        election={election}
        liveMode={isLiveMode}
        setTestMode={setTestModeMutation.mutate}
      />
      <ElectionInfoBar
        mode="pollworker"
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
        pollingPlaceId={pollingPlaceId}
        precinctSelection={appPrecinct}
      />
    </Screen>
  );
}
