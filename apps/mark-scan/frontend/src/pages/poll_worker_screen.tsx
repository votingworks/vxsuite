import React, { useState } from 'react';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  PollsState,
  PollsTransitionType,
  InsertedSmartCardAuth,
  PrecinctSelection,
  VotesDict,
  getBallotStyle,
  getPartyForBallotStyle,
} from '@votingworks/types';
import {
  Button,
  Main,
  Modal,
  Screen,
  ElectionInfoBar,
  H2,
  P,
  Caption,
  Font,
  H4,
  Icons,
  H3,
  SignedHashValidationButton,
  RemoveCardImage,
  electionStrings,
  TestModeCallout,
} from '@votingworks/ui';

import {
  getPollsTransitionDestinationState,
  getPollsStateName,
  getPollsTransitionAction,
  getPollTransitionsFromState,
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
  format,
  getPrecinctsAndSplitsForBallotStyle,
} from '@votingworks/utils';

import type {
  AcceptedPaperType,
  MachineConfig,
} from '@votingworks/mark-scan-backend';
import {
  assertDefined,
  DateWithoutTime,
  find,
  throwIllegalValue,
} from '@votingworks/basics';

import {
  CenteredCardPageLayout,
  pollWorkerComponents,
} from '@votingworks/mark-flow-ui';
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

const { ButtonGrid, SectionSessionStart, VotingSession } = pollWorkerComponents;

const ACCEPTING_ALL_PAPER_TYPES_PARAMS = {
  paperTypes: ['BlankPage', 'InterpretedBmdPage'] as AcceptedPaperType[],
} as const;

const ACCEPTING_PREPRINTED_BALLOT_PARAMS = {
  paperTypes: ['InterpretedBmdPage'] as AcceptedPaperType[],
} as const;

function UpdatePollsButton({
  pollsTransition,
  updatePollsState,
  isPrimaryButton,
}: {
  pollsTransition: PollsTransitionType;
  updatePollsState: (pollsState: PollsState) => void;
  isPrimaryButton: boolean;
}): JSX.Element {
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);

  function closeModal() {
    setIsConfirmationModalOpen(false);
  }

  function confirmUpdate() {
    updatePollsState(getPollsTransitionDestinationState(pollsTransition));
    closeModal();
  }

  const action = getPollsTransitionAction(pollsTransition);
  const explanationText = (() => {
    switch (pollsTransition) {
      case 'open_polls':
        return `After polls are opened, voters will be able to mark and cast ballots.`;
      case 'pause_voting':
        return `After voting is paused, voters will not be able to mark and cast ballots until voting is resumed.`;
      case 'resume_voting':
        return `After voting is resumed, voters will be able to mark and cast ballots.`;
      case 'close_polls':
        return `After polls are closed, voters will no longer be able to mark and cast ballots. Polls cannot be opened again.`;
      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(pollsTransition);
      }
    }
  })();

  return (
    <React.Fragment>
      <Button
        variant={isPrimaryButton ? 'primary' : 'neutral'}
        onPress={() => setIsConfirmationModalOpen(true)}
      >
        {action}
      </Button>
      {isConfirmationModalOpen && (
        <Modal
          title={`${action}`}
          content={<P>{explanationText}</P>}
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={confirmUpdate}>
                {action}
              </Button>
              <Button onPress={closeModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeModal}
        />
      )}
    </React.Fragment>
  );
}

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
  const isElectionDay = election.date.isEqual(DateWithoutTime.today());

  const apiClient = api.useApiClient();

  const setTestModeMutation = setTestMode.useMutation();
  const setPollsStateMutation = setPollsState.useMutation();

  const getStateMachineStateQuery = getStateMachineState.useQuery();
  const stateMachineState = getStateMachineStateQuery.data;

  const setAcceptingPaperStateMutation = setAcceptingPaperState.useMutation();

  /*
   * Various state parameters to handle controlling when certain modals on the page are open or not.
   */
  const [isConfirmingEnableLiveMode, setIsConfirmingEnableLiveMode] = useState(
    !isLiveMode && isElectionDay
  );
  function cancelEnableLiveMode() {
    return setIsConfirmingEnableLiveMode(false);
  }

  function confirmEnableLiveMode() {
    setTestModeMutation.mutate({ isTestMode: false });
    setIsConfirmingEnableLiveMode(false);
  }

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
    const { precinctId, ballotStyleId } = pollWorkerAuth.cardlessVoterUser;
    const ballotStyle = assertDefined(
      getBallotStyle({ election, ballotStyleId })
    );
    const precinctOrSplit = find(
      getPrecinctsAndSplitsForBallotStyle({ election, ballotStyle }),
      ({ precinct }) => precinct.id === precinctId
    );
    const precinctOrSplitName = precinctOrSplit.split
      ? electionStrings.precinctSplitName(precinctOrSplit.split)
      : electionStrings.precinctName(precinctOrSplit.precinct);

    const ballotStyleLabel =
      election.type === 'general' ? (
        <P>
          <Font weight="semiBold">Ballot Style:</Font> {precinctOrSplitName}
        </P>
      ) : (
        <React.Fragment>
          <P>
            <Font weight="semiBold">Precinct:</Font> {precinctOrSplitName}
          </P>
          <P>
            <Font weight="semiBold">Ballot Style:</Font>{' '}
            {
              assertDefined(
                getPartyForBallotStyle({
                  election,
                  ballotStyleId: ballotStyle.id,
                })
              ).name
            }
          </P>
        </React.Fragment>
      );

    if (
      hasVotes &&
      // It's expected there are votes in app state if the state machine reports a blank page after printing.
      // The paper was likely inserted upside down so the solution is to reload paper correctly and go back to
      // the voting screen
      stateMachineState !== 'blank_page_interpretation'
    ) {
      return (
        <CenteredCardPageLayout
          title="Voting Session Paused"
          icon={<Icons.Paused />}
          voterFacing={false}
        >
          <P weight="bold">Remove card to continue voting session.</P>
          {ballotStyleLabel}
          <P>
            <ResetVoterSessionButton>Reset Ballot</ResetVoterSessionButton>
          </P>
        </CenteredCardPageLayout>
      );
    }

    if (
      stateMachineState === 'waiting_for_ballot_data' ||
      stateMachineState === 'waiting_for_voter_auth'
    ) {
      return (
        <CenteredCardPageLayout
          buttons={
            <ResetVoterSessionButton>
              Cancel Voting Session
            </ResetVoterSessionButton>
          }
          icon={
            <div
              style={{
                height: '5rem',
                margin: '0 0.5rem 0 1rem',
                position: 'relative',
                left: '-1rem',
                top: '-6.5rem',
              }}
            >
              <RemoveCardImage aria-hidden cardInsertionDirection="up" />
            </div>
          }
          title="Remove Card to Begin Voting Session"
          voterFacing={false}
        >
          {ballotStyleLabel}
        </CenteredCardPageLayout>
      );
    }

    return null;
  }

  return (
    <Screen>
      <Main padded>
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'start',
            }}
          >
            <H2 as="h1">Poll Worker Menu</H2>
            {!isLiveMode && <TestModeCallout />}
          </div>
          <P>Remove the poll worker card to leave this screen.</P>
          <P style={{ fontSize: '1.2em' }}>
            <Font weight="bold">Ballots Printed:</Font>{' '}
            {format.count(ballotsPrintedCount)}
          </P>

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
          <P style={{ fontSize: '1.2em' }}>
            <Font weight="bold">Polls:</Font> {getPollsStateName(pollsState)}
          </P>
          <ButtonGrid>
            {getPollTransitionsFromState(pollsState).map(
              (pollsTransition, index) => (
                <UpdatePollsButton
                  pollsTransition={pollsTransition}
                  updatePollsState={(newPollsState) =>
                    setPollsStateMutation.mutate({
                      pollsState: newPollsState,
                    })
                  }
                  isPrimaryButton={index === 0}
                  key={`${pollsTransition}-button`}
                />
              )
            )}
          </ButtonGrid>
          <H3>System</H3>
          <ButtonGrid>
            <SignedHashValidationButton apiClient={apiClient} />
          </ButtonGrid>
        </div>
      </Main>
      {isConfirmingEnableLiveMode && (
        <Modal
          centerContent
          title="Switch to Official Ballot Mode and reset the Ballots Printed count?"
          content={
            <div>
              <P>
                Today is election day and this machine is in{' '}
                <Font noWrap weight="bold">
                  Test Ballot Mode.
                </Font>
              </P>
              <Caption>
                Note: Switching back to Test Ballot Mode requires an{' '}
                <Font noWrap>election manager card.</Font>
              </Caption>
            </div>
          }
          actions={
            <React.Fragment>
              <Button
                variant="danger"
                icon="Danger"
                onPress={confirmEnableLiveMode}
              >
                Switch to Official Ballot Mode
              </Button>
              <Button onPress={cancelEnableLiveMode}>Cancel</Button>
            </React.Fragment>
          }
        />
      )}
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
