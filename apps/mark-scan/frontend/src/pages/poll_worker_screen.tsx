import { DateTime } from 'luxon';
import React, { useState, useEffect } from 'react';

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
  Devices,
  HorizontalRule,
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
  FullScreenIconWrapper,
  H3,
  H6,
  Text,
} from '@votingworks/ui';

import {
  Hardware,
  getPollsTransitionDestinationState,
  getPollsStateName,
  getPollsTransitionAction,
  getPollTransitionsFromState,
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
  getDefaultLanguageBallotStyles,
} from '@votingworks/utils';

import type { MachineConfig } from '@votingworks/mark-scan-backend';
import styled from 'styled-components';
import { find, throwIllegalValue } from '@votingworks/basics';

import { triggerAudioFocus } from '../utils/trigger_audio_focus';
import { DiagnosticsScreen } from './diagnostics_screen';
import { LoadPaperPage } from './load_paper_page';
import {
  getStateMachineState,
  setAcceptingPaperState,
  setPollsState,
  setTestMode,
} from '../api';
import { PaperHandlerHardwareCheckDisabledScreen } from './paper_handler_hardware_check_disabled_screen';

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
          content={
            <Prose id="modalaudiofocus">
              <P>{explanationText}</P>
            </Prose>
          }
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
  hardware: Hardware;
  devices: Devices;
  reload: () => void;
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
  hardware,
  devices,
  hasVotes,
  reload,
  precinctSelection,
}: PollworkerScreenProps): JSX.Element | null {
  const { election } = electionDefinition;
  const electionDate = DateTime.fromISO(electionDefinition.election.date);
  const isElectionDay = electionDate.hasSame(DateTime.now(), 'day');

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
   * If you are adding a new modal make sure to add the new parameter to the triggerAudiofocus useEffect
   * dependency. This will retrigger the audio to explain landing on the PollWorker homepage
   * when the modal closes.
   */
  const [isConfirmingEnableLiveMode, setIsConfirmingEnableLiveMode] = useState(
    !isLiveMode && isElectionDay
  );
  function cancelEnableLiveMode() {
    return setIsConfirmingEnableLiveMode(false);
  }
  const [isDiagnosticsScreenOpen, setIsDiagnosticsScreenOpen] = useState(false);

  /*
   * Trigger audiofocus for the PollWorker screen landing page. This occurs when
   * the component first renders, or any of the modals in the page are closed. If you
   * add a new modal to this component add it's state parameter as a dependency here.
   */
  useEffect(() => {
    if (!isConfirmingEnableLiveMode) {
      triggerAudioFocus();
    }
  }, [isConfirmingEnableLiveMode]);

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
        BooleanEnvironmentVariableName.SKIP_PAPER_HANDLER_HARDWARE_CHECK
      )
    ) {
      return (
        <PaperHandlerHardwareCheckDisabledScreen message="Remove the poll worker card to continue." />
      );
    }

    const { precinctId, ballotStyleId } = pollWorkerAuth.cardlessVoterUser;
    const precinct = find(election.precincts, (p) => p.id === precinctId);

    if (stateMachineState === 'waiting_for_ballot_data') {
      return (
        <Screen>
          <Main centerChild padded>
            <Prose id="audiofocus">
              <FullScreenIconWrapper align="center">
                <Icons.Done color="success" />
              </FullScreenIconWrapper>
              <H2 as="h1" align="center">
                {`Voting Session Active: ${ballotStyleId} at ${precinct.name}`}
              </H2>
              <p>Paper has been loaded.</p>
              <ol>
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
                <HorizontalRule>or</HorizontalRule>
              </P>
              <P align="center">Deactivate this voter session to start over.</P>
              <P align="center">
                <Button onPress={resetCardlessVoterSession}>
                  Deactivate Voting Session
                </Button>
              </P>
            </Prose>
          </Main>
        </Screen>
      );
    }

    return null;
  }

  if (isDiagnosticsScreenOpen) {
    return (
      <DiagnosticsScreen
        hardware={hardware}
        devices={devices}
        onBackButtonPress={() => setIsDiagnosticsScreenOpen(false)}
      />
    );
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
                        {ballotStyle.id}
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
              <P>
                <Button onPress={() => setIsDiagnosticsScreenOpen(true)}>
                  System Diagnostics
                </Button>
              </P>
              <P>
                <Button onPress={reload}>Reset Accessible Controller</Button>
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
            <Prose textCenter id="modalaudiofocus">
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
