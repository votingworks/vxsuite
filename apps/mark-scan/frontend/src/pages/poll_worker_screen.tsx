import React, { useState } from 'react';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  PollsState,
  PollsTransitionType,
  InsertedSmartCardAuth,
  PrecinctSelection,
} from '@votingworks/types';
import {
  Button,
  ButtonList,
  Main,
  Modal,
  Prose,
  Screen,
  ElectionInfoBar,
  TestMode,
  NoWrap,
  H1,
  H2,
  P,
  Caption,
  Font,
  H4,
  Icons,
  H3,
  H6,
  Text,
} from '@votingworks/ui';

import {
  getPollsTransitionDestinationState,
  getPollsStateName,
  getPollsTransitionAction,
  getPollTransitionsFromState,
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
  getDefaultLanguageBallotStyles,
  extractBallotStyleGroupId,
} from '@votingworks/utils';

import type { MachineConfig } from '@votingworks/mark-scan-backend';
import styled from 'styled-components';
import { DateWithoutTime, find, throwIllegalValue } from '@votingworks/basics';

import { LoadPaperPage } from './load_paper_page';
import {
  getStateMachineState,
  setAcceptingPaperState,
  setPollsState,
  setTestMode,
} from '../api';
import { PaperHandlerHardwareCheckDisabledScreen } from './paper_handler_hardware_check_disabled_screen';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

const VotingSession = styled.div`
  margin: 30px 0 60px;
  border: 2px solid #000;
  border-radius: 20px;
  padding: 30px 40px;

  & > *:first-child {
    margin-top: 0;
  }

  & > *:last-child {
    margin-bottom: 0;
  }
`;

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
        return `After polls are closed, voters will no longer be able to mark and cast ballots. Polls cannot be opened again after being closed.`;
      /* istanbul ignore next */
      default:
        throwIllegalValue(pollsTransition);
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
          title={`Confirm ${action}`}
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
  resetCardlessVoterSession: () => void;
  electionDefinition: ElectionDefinition;
  hasVotes: boolean;
  isLiveMode: boolean;
  pollsState: PollsState;
  ballotsPrintedCount: number;
  machineConfig: MachineConfig;
  precinctSelection: PrecinctSelection;
}

export function PollWorkerScreen({
  pollWorkerAuth,
  activateCardlessVoterSession,
  resetCardlessVoterSession,
  electionDefinition,
  isLiveMode,
  pollsState,
  ballotsPrintedCount,
  machineConfig,
  hasVotes,
  precinctSelection,
}: PollworkerScreenProps): JSX.Element | null {
  const { election } = electionDefinition;
  const isElectionDay = election.date.isEqual(DateWithoutTime.today());

  const setTestModeMutation = setTestMode.useMutation();
  const setPollsStateMutation = setPollsState.useMutation();

  const getStateMachineStateQuery = getStateMachineState.useQuery();
  const stateMachineState = getStateMachineStateQuery.data;

  const setAcceptingPaperStateMutation = setAcceptingPaperState.useMutation();
  const [selectedCardlessVoterPrecinctId, setSelectedCardlessVoterPrecinctId] =
    useState<PrecinctId | undefined>(
      precinctSelection.kind === 'SinglePrecinct'
        ? precinctSelection.precinctId
        : undefined
    );

  const precinctBallotStyles = selectedCardlessVoterPrecinctId
    ? getDefaultLanguageBallotStyles(election.ballotStyles).filter((bs) =>
        bs.precincts.includes(selectedCardlessVoterPrecinctId)
      )
    : [];
  /*
   * Various state parameters to handle controlling when certain modals on the page are open or not.
   */
  const [isConfirmingEnableLiveMode, setIsConfirmingEnableLiveMode] = useState(
    !isLiveMode && isElectionDay
  );
  function cancelEnableLiveMode() {
    return setIsConfirmingEnableLiveMode(false);
  }

  const canSelectBallotStyle = pollsState === 'polls_open';
  const [isHidingSelectBallotStyle, setIsHidingSelectBallotStyle] =
    useState(false);

  function confirmEnableLiveMode() {
    setTestModeMutation.mutate({ isTestMode: false });
    setIsConfirmingEnableLiveMode(false);
  }

  if (
    stateMachineState === 'accepting_paper' ||
    stateMachineState === 'loading_paper'
  ) {
    return <LoadPaperPage />;
  }

  if (
    hasVotes &&
    pollWorkerAuth.cardlessVoterUser &&
    // It's expected there are votes in app state if the state machine reports a blank page after printing.
    // The paper was likely inserted upside down so the solution is to reload paper correctly and go back to
    // the voting screen
    stateMachineState !== 'blank_page_interpretation'
  ) {
    return (
      <Screen>
        <Main padded centerChild>
          <Text center>
            <H1
              aria-label={`Ballot style ${pollWorkerAuth.cardlessVoterUser.ballotStyleId} has been activated.`}
            >
              Voting Session in Progress
            </H1>
            <P>
              Remove card to allow voter to continue voting, or reset ballot.
            </P>
            <P>
              <Button
                variant="danger"
                icon="Delete"
                onPress={resetCardlessVoterSession}
              >
                Reset Ballot
              </Button>
            </P>
          </Text>
        </Main>
      </Screen>
    );
  }

  if (pollWorkerAuth.cardlessVoterUser) {
    if (
      isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER
      )
    ) {
      return <PaperHandlerHardwareCheckDisabledScreen />;
    }

    const { precinctId, ballotStyleId } = pollWorkerAuth.cardlessVoterUser;
    const precinct = find(election.precincts, (p) => p.id === precinctId);

    if (stateMachineState === 'waiting_for_ballot_data') {
      return (
        <CenteredCardPageLayout
          buttons={
            <Button onPress={resetCardlessVoterSession}>
              Deactivate Voting Session
            </Button>
          }
          icon={<Icons.Done color="success" />}
          title="Voting Session Active:"
          voterFacing={false}
        >
          <H3 as="h2">
            <Font weight="regular">
              Ballot Style {extractBallotStyleGroupId(ballotStyleId)} at{' '}
              {precinct.name}
            </Font>
          </H3>
          <p>Paper has been loaded.</p>
          <ol style={{ marginBottom: '0' }}>
            <li>
              <P>
                Instruct the voter to press the{' '}
                <Font weight="bold" noWrap>
                  Start Voting
                </Font>{' '}
                button on the next screen.
              </P>
            </li>
            <li>
              <P>Remove the poll worker card to continue.</P>
            </li>
          </ol>
          <P>
            <Caption>
              <Icons.Info /> To start over, press the button below to deactivate
              the voter session.
            </Caption>
          </P>
        </CenteredCardPageLayout>
      );
    }

    return null;
  }

  return (
    <Screen>
      {!isLiveMode && <TestMode />}
      <Main padded>
        <Prose maxWidth={false}>
          <H2 as="h1">
            VxMarkScan{' '}
            <Font weight="light" noWrap>
              Poll Worker Actions
            </Font>
          </H2>
          <H4 as="h2">
            <NoWrap>
              <Font weight="light">Ballots Printed:</Font> {ballotsPrintedCount}
            </NoWrap>
            <br />

            <NoWrap>
              <Font weight="light">Polls:</Font> {getPollsStateName(pollsState)}
            </NoWrap>
          </H4>
          {canSelectBallotStyle && !isHidingSelectBallotStyle ? (
            <React.Fragment>
              <VotingSession>
                <H4 as="h2">Start a New Voting Session</H4>
                {precinctSelection.kind === 'AllPrecincts' && (
                  <React.Fragment>
                    <H6 as="h3">1. Select Voter’s Precinct</H6>
                    <ButtonList data-testid="precincts">
                      {election.precincts.map((precinct) => (
                        <Button
                          key={precinct.id}
                          aria-label={`Activate Voter Session for Precinct ${precinct.name}`}
                          onPress={() => {
                            setSelectedCardlessVoterPrecinctId(precinct.id);
                          }}
                          variant={
                            selectedCardlessVoterPrecinctId === precinct.id
                              ? 'primary'
                              : 'neutral'
                          }
                        >
                          {precinct.name}
                        </Button>
                      ))}
                    </ButtonList>
                  </React.Fragment>
                )}
                <H6 as="h3">
                  {precinctSelection.kind === 'AllPrecincts' ? '2. ' : ''}
                  Select Voter’s Ballot Style
                </H6>
                {selectedCardlessVoterPrecinctId ? (
                  <ButtonList data-testid="ballot-styles">
                    {precinctBallotStyles.map((ballotStyle) => (
                      <Button
                        key={ballotStyle.id}
                        onPress={() => {
                          setAcceptingPaperStateMutation.mutate(undefined, {
                            onSuccess() {
                              activateCardlessVoterSession(
                                selectedCardlessVoterPrecinctId,
                                ballotStyle.id
                              );
                            },
                          });
                        }}
                      >
                        {extractBallotStyleGroupId(ballotStyle.id)}
                      </Button>
                    ))}
                  </ButtonList>
                ) : (
                  <Caption>
                    <Icons.Info /> Select the voter’s precinct above to view
                    ballot styles for the precinct.
                  </Caption>
                )}
              </VotingSession>
              <Button onPress={() => setIsHidingSelectBallotStyle(true)}>
                View More Actions
              </Button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div /> {/* Enforces css margin from the following P tag. */}
              {canSelectBallotStyle && (
                <React.Fragment>
                  <P>
                    <Button
                      variant="primary"
                      icon="Previous"
                      onPress={() => setIsHidingSelectBallotStyle(false)}
                    >
                      Back to Ballot Style Selection
                    </Button>
                  </P>
                  <H3 as="h2">More Actions</H3>
                </React.Fragment>
              )}
              <P>
                {getPollTransitionsFromState(pollsState).map(
                  (pollsTransition, index) => {
                    return (
                      <P key={`${pollsTransition}-button`}>
                        <UpdatePollsButton
                          pollsTransition={pollsTransition}
                          updatePollsState={(newPollsState) =>
                            setPollsStateMutation.mutate({
                              pollsState: newPollsState,
                            })
                          }
                          isPrimaryButton={index === 0}
                        />
                      </P>
                    );
                  }
                )}
              </P>
            </React.Fragment>
          )}
        </Prose>
      </Main>
      {isConfirmingEnableLiveMode && (
        <Modal
          centerContent
          title="Switch to Official Ballot Mode and reset the Ballots Printed count?"
          content={
            <Prose textCenter>
              <P>
                Today is election day and this machine is in{' '}
                <Font noWrap weight="bold">
                  Test Ballot Mode.
                </Font>
              </P>
              <Caption>
                Note: Switching back to Test Ballot Mode requires an{' '}
                <NoWrap>Election Manager Card.</NoWrap>
              </Caption>
            </Prose>
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
        mode="admin"
        electionDefinition={electionDefinition}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
        precinctSelection={precinctSelection}
      />
    </Screen>
  );
}
