import React, { useState } from 'react';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  PrecinctSelection,
  PollsState,
  PollsTransitionType,
  InsertedSmartCardAuth,
  getGroupIdFromBallotStyleId,
} from '@votingworks/types';
import {
  Button,
  ButtonList,
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
} from '@votingworks/ui';

import {
  getPollsTransitionDestinationState,
  getPollsStateName,
  getPollsTransitionAction,
  getPollTransitionsFromState,
  getGroupedBallotStyles,
} from '@votingworks/utils';

import type { MachineConfig } from '@votingworks/mark-backend';
import styled from 'styled-components';
import { DateWithoutTime, find, throwIllegalValue } from '@votingworks/basics';

import { DiagnosticsScreen } from './diagnostics_screen';
import { setPollsState, setTestMode } from '../api';

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
        return `After polls are opened, voters will be able to mark ballots.`;
      case 'pause_voting':
        return `After voting is paused, voters will not be able to mark ballots until voting is resumed.`;
      case 'resume_voting':
        return `After voting is resumed, voters will be able to mark ballots.`;
      case 'close_polls':
        return `After polls are closed, voters will no longer be able to mark ballots. Polls cannot be opened again after being closed.`;
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
  appPrecinct: PrecinctSelection;
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  hasVotes: boolean;
  isLiveMode: boolean;
  pollsState: PollsState;
  ballotsPrintedCount: number;
  machineConfig: MachineConfig;
  reload: () => void;
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
  reload,
}: PollworkerScreenProps): JSX.Element {
  const { election } = electionDefinition;
  const isElectionDay = election.date.isEqual(DateWithoutTime.today());

  const setTestModeMutation = setTestMode.useMutation();
  const setPollsStateMutation = setPollsState.useMutation();

  const [selectedCardlessVoterPrecinctId, setSelectedCardlessVoterPrecinctId] =
    useState<PrecinctId | undefined>(
      appPrecinct.kind === 'SinglePrecinct' ? appPrecinct.precinctId : undefined
    );

  const precinctBallotStyles = selectedCardlessVoterPrecinctId
    ? getGroupedBallotStyles(election.ballotStyles).filter((group) =>
        group.precincts.includes(selectedCardlessVoterPrecinctId)
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
  const [isDiagnosticsScreenOpen, setIsDiagnosticsScreenOpen] = useState(false);

  const canSelectBallotStyle = pollsState === 'polls_open';
  const [isHidingSelectBallotStyle, setIsHidingSelectBallotStyle] =
    useState(false);

  function confirmEnableLiveMode() {
    setTestModeMutation.mutate({ isTestMode: false });
    setIsConfirmingEnableLiveMode(false);
  }

  if (hasVotes && pollWorkerAuth.cardlessVoterUser) {
    return (
      <Screen>
        <Main centerChild>
          <Prose textCenter>
            <H1
              aria-label={`Ballot style ${pollWorkerAuth.cardlessVoterUser.ballotStyleId} has been activated.`}
            >
              Ballot Contains Votes
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
          </Prose>
        </Main>
      </Screen>
    );
  }

  if (pollWorkerAuth.cardlessVoterUser) {
    const { precinctId, ballotStyleId } = pollWorkerAuth.cardlessVoterUser;
    const ballotStyleGroupId = getGroupIdFromBallotStyleId({
      ballotStyleId,
      election,
    });
    const precinct = find(election.precincts, (p) => p.id === precinctId);

    return (
      <Screen>
        <Main centerChild padded>
          <Prose>
            <FullScreenIconWrapper align="center">
              <Icons.Done color="success" />
            </FullScreenIconWrapper>
            <H2 as="h1" align="center">
              Voting Session Active:
            </H2>
            <H3 as="h2" align="center">
              <Font weight="regular">
                Ballot Style {ballotStyleGroupId} at {precinct.name}
              </Font>
            </H3>
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
            <HorizontalRule>or</HorizontalRule>
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

  if (isDiagnosticsScreenOpen) {
    return (
      <DiagnosticsScreen
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
            VxMark{' '}
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
                {appPrecinct.kind === 'AllPrecincts' && (
                  <React.Fragment>
                    <H6 as="h3">1. Select Voter’s Precinct</H6>
                    <ButtonList data-testid="precincts">
                      {election.precincts.map((precinct) => (
                        <Button
                          key={precinct.id}
                          aria-label={`Activate Voter Session for Precinct ${precinct.name}`}
                          onPress={() =>
                            setSelectedCardlessVoterPrecinctId(precinct.id)
                          }
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
                  {appPrecinct.kind === 'AllPrecincts' ? '2. ' : ''}Select
                  Voter’s Ballot Style
                </H6>
                {selectedCardlessVoterPrecinctId ? (
                  <ButtonList data-testid="ballot-styles">
                    {precinctBallotStyles.map((ballotStyleGroup) => (
                      <Button
                        key={ballotStyleGroup.id}
                        onPress={() =>
                          activateCardlessVoterSession(
                            selectedCardlessVoterPrecinctId,
                            ballotStyleGroup.defaultLanguageBallotStyle.id
                          )
                        }
                      >
                        {ballotStyleGroup.id}
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
                      icon="Previous"
                      variant="primary"
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
            <Prose textCenter>
              <P>
                Today is election day and this machine is in{' '}
                <Font noWrap weight="bold">
                  Test Ballot Mode.
                </Font>
              </P>
              <Caption>
                Note: Switching back to Test Ballot Mode requires an{' '}
                <NoWrap>election manager card.</NoWrap>
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
        electionPackageHash={electionPackageHash}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
        precinctSelection={appPrecinct}
      />
    </Screen>
  );
}
