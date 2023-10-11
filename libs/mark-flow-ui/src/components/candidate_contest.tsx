import camelCase from 'lodash.camelcase';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';

import {
  Candidate,
  CandidateVote,
  CandidateContest as CandidateContestInterface,
  getCandidatePartiesDescription,
  getContestDistrictName,
  Election,
} from '@votingworks/types';
import {
  Button,
  ContestChoiceButton,
  Icons,
  Main,
  Modal,
  Prose,
  P,
  Font,
  VirtualKeyboard,
  Caption,
  TouchTextInput,
  WithScrollButtons,
  ModalWidth,
  useScreenInfo,
  appStrings,
  renderCandidatePartyList,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';

import pluralize from 'pluralize';
import { stripQuotes } from '../utils/strip_quotes';

import { UpdateVoteFunction } from '../config/types';

import { WRITE_IN_CANDIDATE_MAX_LENGTH } from '../config/globals';
import { ChoicesGrid } from './contest_screen_layout';
import { BreadcrumbMetadata, ContestHeader } from './contest_header';

interface Props {
  breadcrumbs?: BreadcrumbMetadata;
  election: Election;
  contest: CandidateContestInterface;
  vote: CandidateVote;
  updateVote: UpdateVoteFunction;
}

const WriteInModalBody = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: space-between;
`;

const WriteInForm = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  justify-content: center;
  flex-shrink: 1;
  max-width: 100%;
`;

const WriteInModalActionsSidebar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  justify-content: center;
`;

function findCandidateById(candidates: readonly Candidate[], id: string) {
  return candidates.find((c) => c.id === id);
}

function normalizeCandidateName(name: string) {
  return name.trim().replace(/\t+/g, ' ').replace(/\s+/g, ' ');
}

export function CandidateContest({
  breadcrumbs,
  election,
  contest,
  vote,
  updateVote,
}: Props): JSX.Element {
  const districtName = getContestDistrictName(election, contest);

  const [attemptedOvervoteCandidate, setAttemptedOvervoteCandidate] =
    useState<Candidate>();
  const [candidatePendingRemoval, setCandidatePendingRemoval] =
    useState<Candidate>();
  const [writeInCandidateModalIsOpen, setWriteInCandidateModalIsOpen] =
    useState(false);
  const [writeInCandidateName, setWriteInCandidateName] = useState('');
  const [deselectedCandidate, setDeselectedCandidate] = useState('');

  const screenInfo = useScreenInfo();

  useEffect(() => {
    if (deselectedCandidate !== '') {
      const timer = setTimeout(() => {
        setDeselectedCandidate('');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [deselectedCandidate]);

  function addCandidateToVote(id: string) {
    const { candidates } = contest;
    const candidate = findCandidateById(candidates, id);
    assert(candidate);
    updateVote(contest.id, [...vote, candidate]);
  }

  function removeCandidateFromVote(id: string) {
    const newVote = vote.filter((c) => c.id !== id);
    updateVote(contest.id, newVote);
    setDeselectedCandidate(id);
  }

  function handleUpdateSelection(candidateId: string) {
    /* istanbul ignore else */
    if (candidateId) {
      const candidate = findCandidateById(vote, candidateId);
      if (candidate) {
        if (candidate.isWriteIn) {
          setCandidatePendingRemoval(candidate);
        } else {
          removeCandidateFromVote(candidateId);
        }
      } else {
        addCandidateToVote(candidateId);
      }
    }
  }

  function handleChangeVoteAlert(candidate?: Candidate) {
    setAttemptedOvervoteCandidate(candidate);
  }

  function closeAttemptedVoteAlert() {
    setAttemptedOvervoteCandidate(undefined);
  }

  function clearCandidateIdPendingRemoval() {
    setCandidatePendingRemoval(undefined);
  }

  function confirmRemovePendingWriteInCandidate() {
    assert(candidatePendingRemoval);
    removeCandidateFromVote(candidatePendingRemoval.id);
    clearCandidateIdPendingRemoval();
  }

  function toggleWriteInCandidateModal(newValue: boolean) {
    setWriteInCandidateModalIsOpen(newValue);
  }

  function initWriteInCandidate() {
    toggleWriteInCandidateModal(true);
  }

  function addWriteInCandidate() {
    const normalizedCandidateName =
      normalizeCandidateName(writeInCandidateName);
    updateVote(contest.id, [
      ...vote,
      {
        id: `write-in-${camelCase(normalizedCandidateName)}`,
        isWriteIn: true,
        name: normalizedCandidateName,
      },
    ]);
    setWriteInCandidateName('');
    toggleWriteInCandidateModal(false);
  }

  function cancelWriteInCandidateModal() {
    setWriteInCandidateName('');
    toggleWriteInCandidateModal(false);
  }

  function onKeyboardInput(key: string) {
    setWriteInCandidateName((prevName) => {
      return (prevName + key)
        .trimStart()
        .replace(/\s+/g, ' ')
        .slice(0, WRITE_IN_CANDIDATE_MAX_LENGTH);
    });
  }

  function onKeyboardBackspace() {
    setWriteInCandidateName((prevName) => {
      return prevName.slice(0, Math.max(0, prevName.length - 1));
    });
  }

  const writeInCharsRemaining =
    WRITE_IN_CANDIDATE_MAX_LENGTH - writeInCandidateName.length;

  function keyDisabled() {
    return writeInCharsRemaining === 0;
  }

  function handleDisabledAddWriteInClick() {
    handleChangeVoteAlert({
      id: 'write-in',
      name: 'a write-in candidate',
    });
  }

  const hasReachedMaxSelections = contest.seats === vote.length;

  const modalActions = (
    <React.Fragment>
      <Button
        variant="done"
        onPress={addWriteInCandidate}
        disabled={normalizeCandidateName(writeInCandidateName).length === 0}
      >
        Accept
      </Button>
      <Button onPress={cancelWriteInCandidateModal}>Cancel</Button>
    </React.Fragment>
  );

  return (
    <React.Fragment>
      <Main flexColumn>
        <ContestHeader
          breadcrumbs={breadcrumbs}
          contest={contest}
          districtName={districtName}
        >
          <Caption>
            {appStrings.numSeatsInstructions(contest.seats)}{' '}
            {vote.length === contest.seats && (
              <Font weight="bold">
                {appStrings.numVotesSelected(contest.seats)}
              </Font>
            )}
            {vote.length < contest.seats && vote.length !== 0 && (
              <Font weight="bold">
                {appStrings.numVotesRemaining(contest.seats - vote.length)}
              </Font>
            )}
            <span className="screen-reader-only">
              {appStrings.contestNavigationInstructions()}
            </span>
          </Caption>
        </ContestHeader>
        <WithScrollButtons>
          <ChoicesGrid>
            {contest.candidates.map((candidate) => {
              const isChecked = !!findCandidateById(vote, candidate.id);
              const isDisabled = hasReachedMaxSelections && !isChecked;
              function handleDisabledClick() {
                handleChangeVoteAlert(candidate);
              }
              const partiesDescription = getCandidatePartiesDescription(
                election,
                candidate
              );
              let prefixAudioText = '';
              if (isChecked) {
                prefixAudioText = 'Selected,';
              } else if (deselectedCandidate === candidate.id) {
                prefixAudioText = 'Deselected,';
              }
              return (
                <ContestChoiceButton
                  key={candidate.id}
                  isSelected={isChecked}
                  onPress={
                    isDisabled ? handleDisabledClick : handleUpdateSelection
                  }
                  choice={candidate.id}
                  ariaLabel={`${prefixAudioText} ${stripQuotes(
                    candidate.name
                  )}${partiesDescription ? `, ${partiesDescription}` : ''}.`}
                  label={candidate.name}
                  caption={renderCandidatePartyList(
                    candidate,
                    election.parties
                  )}
                />
              );
            })}
            {contest.allowWriteIns &&
              vote
                .filter((c) => c.isWriteIn)
                .map((candidate) => {
                  return (
                    <ContestChoiceButton
                      key={candidate.id}
                      isSelected
                      choice={candidate.id}
                      onPress={handleUpdateSelection}
                      ariaLabel={`Selected, write-in: ${candidate.name}.`}
                      label={candidate.name}
                      caption="Write-In"
                    />
                  );
                })}
            {contest.allowWriteIns && (
              <ContestChoiceButton
                choice="write-in"
                isSelected={false}
                onPress={
                  hasReachedMaxSelections
                    ? handleDisabledAddWriteInClick
                    : initWriteInCandidate
                }
                label={
                  <span>
                    <Icons.Edit /> {appStrings.buttonAddWriteIn()}
                  </span>
                }
              />
            )}
          </ChoicesGrid>
        </WithScrollButtons>
      </Main>
      {attemptedOvervoteCandidate && (
        <Modal
          ariaLabel=""
          centerContent
          content={
            <Prose>
              <P id="modalaudiofocus">
                You may only select {contest.seats}{' '}
                {contest.seats === 1 ? 'candidate' : 'candidates'} in this
                contest. To vote for {attemptedOvervoteCandidate.name}, you must
                first unselect the selected{' '}
                {contest.seats === 1 ? 'candidate' : 'candidates'}.
                <span aria-label="Use the select button to continue." />
              </P>
            </Prose>
          }
          actions={
            <Button
              variant="primary"
              autoFocus
              onPress={closeAttemptedVoteAlert}
              aria-label="use the select button to continue."
            >
              Okay
            </Button>
          }
        />
      )}
      {candidatePendingRemoval && (
        <Modal
          centerContent
          content={
            <Prose>
              <P id="modalaudiofocus">
                Do you want to unselect and remove{' '}
                {candidatePendingRemoval.name}?
              </P>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                variant="danger"
                onPress={confirmRemovePendingWriteInCandidate}
              >
                Yes, Remove.
              </Button>
              <Button onPress={clearCandidateIdPendingRemoval}>Cancel</Button>
            </React.Fragment>
          }
        />
      )}
      {/* TODO: This should really be broken out into separate components. */}
      {writeInCandidateModalIsOpen && (
        <Modal
          ariaLabel=""
          modalWidth={ModalWidth.Wide}
          title={`Write-In: ${contest.title}`}
          content={
            <div>
              <div id="modalaudiofocus">
                <P>
                  <Caption aria-label="Enter the name of a person who is not on the ballot. Use the up and down buttons to navigate between the letters of a standard keyboard. Use the select button to select the current letter.">
                    <Icons.Info /> Enter the name of a person who is{' '}
                    <Font weight="bold">not</Font> on the ballot:
                  </Caption>
                </P>
              </div>
              <WriteInModalBody>
                <WriteInForm>
                  <TouchTextInput value={writeInCandidateName} />
                  <P
                    align="right"
                    color={writeInCharsRemaining ? 'default' : 'warning'}
                  >
                    <Caption>
                      {writeInCharsRemaining === 0 && <Icons.Warning />}{' '}
                      {writeInCharsRemaining}{' '}
                      {pluralize('character', writeInCharsRemaining)} remaining
                    </Caption>
                  </P>
                  <VirtualKeyboard
                    onBackspace={onKeyboardBackspace}
                    onKeyPress={onKeyboardInput}
                    keyDisabled={keyDisabled}
                  />
                </WriteInForm>
                {!screenInfo.isPortrait && (
                  <WriteInModalActionsSidebar>
                    {modalActions}
                  </WriteInModalActionsSidebar>
                )}
              </WriteInModalBody>
            </div>
          }
          actions={screenInfo.isPortrait ? modalActions : undefined}
        />
      )}
    </React.Fragment>
  );
}
