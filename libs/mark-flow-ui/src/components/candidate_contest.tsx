import camelCase from 'lodash.camelcase';
import React, { ReactNode, useEffect, useState } from 'react';
import styled from 'styled-components';

import {
  Candidate,
  CandidateVote,
  CandidateContest as CandidateContestInterface,
  Election,
  getContestDistrict,
} from '@votingworks/types';
import {
  Button,
  ContestChoiceButton,
  Icons,
  Main,
  Modal,
  P,
  VirtualKeyboard,
  Caption,
  TouchTextInput,
  WithScrollButtons,
  ModalWidth,
  useScreenInfo,
  appStrings,
  CandidatePartyList,
  NumberString,
  AudioOnly,
  electionStrings,
  ButtonPressEvent,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';

import { UpdateVoteFunction, getInteractionMethod } from '../config/types';

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
  const district = getContestDistrict(election, contest);

  const [attemptedOvervoteCandidate, setAttemptedOvervoteCandidate] =
    useState<Candidate>();
  const [writeInPendingRemoval, setWriteInPendingRemoval] =
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

  function addCandidateToVote(id: string, event: ButtonPressEvent) {
    const { candidates } = contest;
    const candidate = findCandidateById(candidates, id);
    assert(candidate);
    updateVote(contest.id, [...vote, candidate], getInteractionMethod(event));
  }

  function removeCandidateFromVote(id: string, event: ButtonPressEvent) {
    const newVote = vote.filter((c) => c.id !== id);
    updateVote(contest.id, newVote, getInteractionMethod(event));
    setDeselectedCandidate(id);
  }

  function handleUpdateSelection(event: ButtonPressEvent, candidateId: string) {
    /* istanbul ignore else */
    if (candidateId) {
      const candidate = findCandidateById(vote, candidateId);
      if (candidate) {
        if (candidate.isWriteIn) {
          setWriteInPendingRemoval(candidate);
        } else {
          removeCandidateFromVote(candidateId, event);
        }
      } else {
        addCandidateToVote(candidateId, event);
      }
    }
  }

  function handleChangeVoteAlert(candidate?: Candidate) {
    setAttemptedOvervoteCandidate(candidate);
  }

  function closeAttemptedVoteAlert() {
    setAttemptedOvervoteCandidate(undefined);
  }

  function clearWriteInPendingRemoval() {
    setWriteInPendingRemoval(undefined);
  }

  function confirmRemovePendingWriteInCandidate(event: ButtonPressEvent) {
    assert(writeInPendingRemoval);
    removeCandidateFromVote(writeInPendingRemoval.id, event);
    clearWriteInPendingRemoval();
  }

  function toggleWriteInCandidateModal(newValue: boolean) {
    setWriteInCandidateModalIsOpen(newValue);
  }

  function initWriteInCandidate() {
    toggleWriteInCandidateModal(true);
  }

  function addWriteInCandidate(event: ButtonPressEvent) {
    const normalizedCandidateName =
      normalizeCandidateName(writeInCandidateName);
    updateVote(
      contest.id,
      [
        ...vote,
        {
          id: `write-in-${camelCase(normalizedCandidateName)}`,
          isWriteIn: true,
          name: normalizedCandidateName,
        },
      ],
      getInteractionMethod(event)
    );
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
        variant="primary"
        icon="Done"
        onPress={addWriteInCandidate}
        disabled={normalizeCandidateName(writeInCandidateName).length === 0}
      >
        {appStrings.buttonAccept()}
      </Button>
      <Button onPress={cancelWriteInCandidateModal}>
        {appStrings.buttonCancel()}
      </Button>
    </React.Fragment>
  );

  return (
    <React.Fragment>
      <Main flexColumn>
        <ContestHeader
          breadcrumbs={breadcrumbs}
          contest={contest}
          district={district}
        >
          <Caption>
            {appStrings.labelNumVotesRemaining()}{' '}
            <NumberString value={contest.seats - vote.length} weight="bold" />
            <AudioOnly>
              {appStrings.instructionsBmdContestNavigation()}
            </AudioOnly>
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
              let prefixAudioText: ReactNode = null;
              if (isChecked) {
                prefixAudioText = appStrings.labelSelected();
              } else if (deselectedCandidate === candidate.id) {
                prefixAudioText = appStrings.labelDeselected();
              }
              return (
                <ContestChoiceButton
                  key={candidate.id}
                  isSelected={isChecked}
                  onPress={
                    isDisabled ? handleDisabledClick : handleUpdateSelection
                  }
                  choice={candidate.id}
                  label={
                    <React.Fragment>
                      <AudioOnly>{prefixAudioText}</AudioOnly>
                      {electionStrings.candidateName(candidate)}
                    </React.Fragment>
                  }
                  caption={
                    <CandidatePartyList
                      candidate={candidate}
                      electionParties={election.parties}
                    />
                  }
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
                      label={
                        <React.Fragment>
                          <AudioOnly>
                            {appStrings.labelSelected()}
                            {appStrings.labelWriteInCandidateName()}
                          </AudioOnly>
                          {/* User-generated content - no translation/audio available: */}
                          {candidate.name}
                        </React.Fragment>
                      }
                      caption={appStrings.labelWriteInTitleCase()}
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
          centerContent
          content={
            <P id="modalaudiofocus">
              {appStrings.warningOvervoteCandidateContest()}
              <AudioOnly>
                {appStrings.instructionsBmdSelectToContinue()}
              </AudioOnly>
            </P>
          }
          actions={
            <Button
              variant="primary"
              autoFocus
              onPress={closeAttemptedVoteAlert}
            >
              {appStrings.buttonOkay() /* TODO(kofi): Exclude from audio: */}
              <AudioOnly>
                {appStrings.instructionsBmdSelectToContinue()}
              </AudioOnly>
            </Button>
          }
        />
      )}
      {writeInPendingRemoval && (
        <Modal
          centerContent
          content={
            <P id="modalaudiofocus">
              {appStrings.promptBmdConfirmRemoveWriteIn()}
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                variant="danger"
                icon="Delete"
                onPress={confirmRemovePendingWriteInCandidate}
              >
                {appStrings.buttonYes()}
              </Button>
              <Button onPress={clearWriteInPendingRemoval}>
                {appStrings.buttonNo()}
              </Button>
            </React.Fragment>
          }
        />
      )}
      {/* TODO: This should really be broken out into separate components. */}
      {writeInCandidateModalIsOpen && (
        <Modal
          modalWidth={ModalWidth.Wide}
          title={
            <React.Fragment>
              {appStrings.labelWriteInTitleCaseColon()}{' '}
              {electionStrings.contestTitle(contest)}
            </React.Fragment>
          }
          content={
            <div>
              <div id="modalaudiofocus">
                <P>
                  <Caption>
                    <Icons.Info /> {appStrings.labelBmdWriteInForm()}
                  </Caption>
                  <AudioOnly>
                    {appStrings.instructionsBmdWriteInFormNavigation()}
                  </AudioOnly>
                </P>
              </div>
              <WriteInModalBody>
                <WriteInForm>
                  <TouchTextInput value={writeInCandidateName} />
                  <P align="right">
                    <Caption>
                      {writeInCharsRemaining === 0 && (
                        <Icons.Warning color="warning" />
                      )}{' '}
                      {appStrings.labelCharactersRemaining()}{' '}
                      {writeInCharsRemaining}
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
