import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
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
import {
  getSystemSettings,
  setPollsState,
  setTestMode,
  useApiClient,
} from '../api.js';
import { PrintBlankBallotScreen } from './print_blank_ballot_screen.js';

export interface PollworkerScreenProps {
  pollWorkerAuth: InsertedSmartCardAuth.PollWorkerLoggedIn;
  activateCardlessVoterSession: (
    precinctId: PrecinctId,
    ballotStyleId: BallotStyleId
  ) => void;
  resetCardlessVoterSession: () => void;
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  hasVotes: boolean;
  isLiveMode: boolean;
  pollsState: PollsState;
  ballotsPrintedCount: number;
  machineConfig: MachineConfig;
  pollingPlaceId: string;
}

export function PollWorkerScreen({
  pollWorkerAuth,
  activateCardlessVoterSession,
  resetCardlessVoterSession,
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

  const [showPrintBlankBallotScreen, setShowPrintBlankBallotScreen] =
    React.useState(false);

  const apiClient = useApiClient();
  const systemSettingsQuery = getSystemSettings.useQuery();
  const setPollsStateMutation = setPollsState.useMutation();
  const setTestModeMutation = setTestMode.useMutation();

  const allowPrintingBlankBallots = Boolean(
    systemSettingsQuery.data?.allowPrintingBlankBallotsFromVxMark
  );

  const onChooseBallotStyle = React.useCallback(
    (precinctId: PrecinctId, ballotStyleId: BallotStyleId) => {
      activateCardlessVoterSession(precinctId, ballotStyleId);
    },
    [activateCardlessVoterSession]
  );

  const onPressPrintBlankBallot = React.useCallback(() => {
    setShowPrintBlankBallotScreen(true);
  }, []);

  if (hasVotes && pollWorkerAuth.cardlessVoterUser) {
    return (
      <ScreenVotingInProgress
        election={election}
        resetVoterSessionButton={
          <Button
            variant="danger"
            icon="Cancel"
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

  if (showPrintBlankBallotScreen) {
    return (
      <PrintBlankBallotScreen
        isLiveMode={isLiveMode}
        election={election}
        electionPackageHash={electionPackageHash}
        electionDefinition={electionDefinition}
        machineConfig={machineConfig}
        pollingPlaceId={pollingPlaceId}
        onBackButtonPress={() => setShowPrintBlankBallotScreen(false)}
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
            />
          )}
          {allowPrintingBlankBallots && pollsState === 'polls_open' && (
            <Button onPress={onPressPrintBlankBallot}>
              Print Blank Ballot
            </Button>
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
      />
    </Screen>
  );
}
