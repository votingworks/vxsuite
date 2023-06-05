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
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';

import pluralize from 'pluralize';
import { stripQuotes } from '../utils/strip_quotes';

import { UpdateVoteFunction } from '../config/types';

import { WRITE_IN_CANDIDATE_MAX_LENGTH } from '../config/globals';
import { ContentHeader, ChoicesGrid } from './contest_screen_layout';
import { ContestTitle } from './contest_title';

const WriteInModalContent = styled.div``;

interface Props {
  election: Election;
  contest: CandidateContestInterface;
  vote: CandidateVote;
  updateVote: UpdateVoteFunction;
}

function findCandidateById(candidates: readonly Candidate[], id: string) {
  return candidates.find((c) => c.id === id);
}

function normalizeCandidateName(name: string) {
  return name.trim().replace(/\t+/g, ' ').replace(/\s+/g, ' ');
}

export function CandidateContest({
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

  return (
    <React.Fragment>
      <Main flexColumn>
        <ContentHeader id="contest-header">
          <Prose id="audiofocus">
            <ContestTitle districtName={districtName} title={contest.title} />
            <Caption>
              Vote for {contest.seats}.{' '}
              {vote.length === contest.seats && (
                <Font weight="bold">You have selected {contest.seats}.</Font>
              )}
              {vote.length < contest.seats && vote.length !== 0 && (
                <Font weight="bold">
                  You may select {contest.seats - vote.length} more.
                </Font>
              )}
              <span className="screen-reader-only">
                To navigate through the contest choices, use the down button. To
                move to the next contest, use the right button.
              </span>
            </Caption>
          </Prose>
        </ContentHeader>
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
                  caption={partiesDescription}
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
                    <Icons.Edit /> add write-in candidate
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
          title={`Write-In: ${contest.title}`}
          content={
            <WriteInModalContent>
              <Prose id="modalaudiofocus" maxWidth={false}>
                <P>
                  <Caption aria-label="Enter the name of a person who is not on the ballot. Use the up and down buttons to navigate between the letters of a standard keyboard. Use the select button to select the current letter.">
                    <Icons.Info /> Enter the name of a person who is{' '}
                    <Font weight="bold">not</Font> on the ballot:
                  </Caption>
                </P>
              </Prose>
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
            </WriteInModalContent>
          }
          actions={
            <React.Fragment>
              <Button
                variant="done"
                onPress={addWriteInCandidate}
                disabled={
                  normalizeCandidateName(writeInCandidateName).length === 0
                }
              >
                Accept
              </Button>
              <Button onPress={cancelWriteInCandidateModal}>Cancel</Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}
