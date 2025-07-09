import React from 'react';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  PollsState,
  InsertedSmartCardAuth,
  PrecinctSelection,
  VotesDict,
} from '@votingworks/types';
import {
  Button,
  Main,
  Screen,
  ElectionInfoBar,
  P,
  H4,
  Icons,
} from '@votingworks/ui';

import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';

import type {
  AcceptedPaperType,
  MachineConfig,
} from '@votingworks/mark-scan-backend';

import { pollWorkerComponents } from '@votingworks/mark-flow-ui';
import { LoadPaperPage } from './load_paper_page';
import {
  getStateMachineState,
  setAcceptingPaperState,
  setPollsState,
  setTestMode,
} from '../api';
import * as api from '../api';
import { InsertedInvalidNewSheetScreen } from './inserted_invalid_new_sheet_screen';
import { InsertedPreprintedBallotScreen } from './inserted_preprinted_ballot_screen';
import { LoadingNewSheetScreen } from './loading_new_sheet_screen';
import { BallotReadyForReviewScreen } from './ballot_ready_for_review_screen';
import {
  BallotReinsertionFlow,
  isBallotReinsertionState,
} from '../ballot_reinsertion_flow';
import { ResetVoterSessionButton } from '../components/deactivate_voter_session_button';

const {
  EnableLiveModeModal,
  ScreenBeginVoting,
  ScreenVotingInProgress,
  SectionHeader,
  SectionPollsState,
  SectionSessionStart,
  SectionSystem,
  VotingSession,
} = pollWorkerComponents;

const ACCEPTING_ALL_PAPER_TYPES_PARAMS = {
  paperTypes: ['BlankPage', 'InterpretedBmdPage'] as AcceptedPaperType[],
} as const;

const ACCEPTING_PREPRINTED_BALLOT_PARAMS = {
  paperTypes: ['InterpretedBmdPage'] as AcceptedPaperType[],
} as const;

export interface PollworkerScreenProps {
  pollWorkerAuth: InsertedSmartCardAuth.PollWorkerLoggedIn;
  activateCardlessVoterSession: (
    precinctId: PrecinctId,
    ballotStyleId: BallotStyleId
  ) => void;
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  hasVotes: boolean;
  isLiveMode: boolean;
  pollsState: PollsState;
  ballotsPrintedCount: number;
  machineConfig: MachineConfig;
  precinctSelection: PrecinctSelection;
  setVotes: (votes: VotesDict) => void;
}

export function PollWorkerScreen({
  pollWorkerAuth,
  activateCardlessVoterSession,
  electionDefinition,
  electionPackageHash,
  isLiveMode,
  pollsState,
  ballotsPrintedCount,
  machineConfig,
  hasVotes,
  precinctSelection,
  setVotes,
}: PollworkerScreenProps): JSX.Element | null {
  const { election } = electionDefinition;

  const apiClient = api.useApiClient();

  const setTestModeMutation = setTestMode.useMutation();
  const setPollsStateMutation = setPollsState.useMutation();

  const getStateMachineStateQuery = getStateMachineState.useQuery();
  const stateMachineState = getStateMachineStateQuery.data;

  const setAcceptingPaperStateMutation = setAcceptingPaperState.useMutation();

  const mutateAcceptingPaperState = setAcceptingPaperStateMutation.mutate;
  const onChooseBallotStyle = React.useCallback(
    (precinctId: PrecinctId, ballotStyleId: BallotStyleId) => {
      mutateAcceptingPaperState(ACCEPTING_ALL_PAPER_TYPES_PARAMS, {
        onSuccess: () => {
          activateCardlessVoterSession(precinctId, ballotStyleId);
        },
      });
    },
    [activateCardlessVoterSession, mutateAcceptingPaperState]
  );

  // TODO(kofi): Remove once we've added mock paper handler functionality to the
  // dev dock:
  const setMockPaperHandlerStatus =
    api.setMockPaperHandlerStatus.useMutation().mutate;
  React.useEffect(() => {
    /* istanbul ignore next - @preserve */
    if (
      stateMachineState === 'accepting_paper' &&
      isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER
      )
    ) {
      setMockPaperHandlerStatus({ mockStatus: 'paperInserted' });
    }
  }, [setMockPaperHandlerStatus, stateMachineState]);

  if (isBallotReinsertionState(stateMachineState)) {
    return <BallotReinsertionFlow stateMachineState={stateMachineState} />;
  }

  if (stateMachineState === 'accepting_paper') {
    return <LoadPaperPage />;
  }

  if (
    stateMachineState === 'validating_new_sheet' ||
    stateMachineState === 'loading_new_sheet'
  ) {
    return <LoadingNewSheetScreen />;
  }

  if (stateMachineState === 'inserted_invalid_new_sheet') {
    return <InsertedInvalidNewSheetScreen />;
  }

  if (stateMachineState === 'inserted_preprinted_ballot') {
    return (
      <InsertedPreprintedBallotScreen
        activateCardlessVoterSession={activateCardlessVoterSession}
        setVotes={setVotes}
      />
    );
  }

  if (stateMachineState === 'presenting_ballot') {
    return <BallotReadyForReviewScreen />;
  }

  if (pollWorkerAuth.cardlessVoterUser) {
    if (
      hasVotes &&
      // It's expected there are votes in app state if the state machine reports a blank page after printing.
      // The paper was likely inserted upside down so the solution is to reload paper correctly and go back to
      // the voting screen
      stateMachineState !== 'blank_page_interpretation'
    ) {
      return (
        <ScreenVotingInProgress
          election={election}
          resetVoterSessionButton={
            <ResetVoterSessionButton>Reset Ballot</ResetVoterSessionButton>
          }
          voter={pollWorkerAuth.cardlessVoterUser}
        />
      );
    }

    if (
      stateMachineState === 'waiting_for_ballot_data' ||
      stateMachineState === 'waiting_for_voter_auth'
    ) {
      return (
        <ScreenBeginVoting
          election={election}
          resetVoterSessionButton={
            <ResetVoterSessionButton>
              Cancel Voting Session
            </ResetVoterSessionButton>
          }
          voter={pollWorkerAuth.cardlessVoterUser}
        />
      );
    }

    return null;
  }

  return (
    <Screen>
      <Main padded>
        <div>
          <SectionHeader
            ballotsPrintedCount={ballotsPrintedCount}
            liveMode={isLiveMode}
          />
          {pollsState === 'polls_open' && (
            <React.Fragment>
              <SectionSessionStart
                election={election}
                onChooseBallotStyle={onChooseBallotStyle}
                precinctSelection={precinctSelection}
              />
              <VotingSession>
                <H4 as="h2">Cast a Previously Printed Ballot</H4>
                <P>
                  <Icons.Info /> The voter will have a chance to review and
                  verify votes from the printed ballot before it is cast.
                </P>
                <P>
                  <Button
                    onPress={setAcceptingPaperStateMutation.mutate}
                    value={ACCEPTING_PREPRINTED_BALLOT_PARAMS}
                  >
                    Insert Printed Ballot
                  </Button>
                </P>
              </VotingSession>
            </React.Fragment>
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
        precinctSelection={precinctSelection}
      />
    </Screen>
  );
}
