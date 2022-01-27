import camelCase from 'lodash.camelcase';
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';

import {
  Candidate,
  CandidateVote,
  CandidateContest as CandidateContestInterface,
  Parties,
  getPrecinctIndexById,
} from '@votingworks/types';
import { Button, Main } from '@votingworks/ui';
import { assert, getContestCandidatesInRotatedOrder } from '@votingworks/utils';

import { findPartyById } from '../utils/find';
import { stripQuotes } from '../utils/strip_quotes';

import {
  EventTargetFunction,
  ScrollDirections,
  UpdateVoteFunction,
} from '../config/types';

import { BallotContext } from '../contexts/ballot_context';

import { Blink } from './animations';
import { FONT_SIZES, WRITE_IN_CANDIDATE_MAX_LENGTH } from '../config/globals';
import { ChoiceButton } from './choice_button';
import { Modal } from './modal';
import { Prose } from './prose';
import { Text } from './text';
import { VirtualKeyboard } from './virtual_keyboard';
import {
  ContentHeader,
  ContestSection,
  VariableContentContainer,
  ScrollControls,
  ScrollContainer,
  ScrollableContentWrapper,
  ChoicesGrid,
} from './contest_screen_layout';

const WriteInModalContent = styled.div`
  margin: -0.5rem;
  max-width: 80vw;
`;

const WriteInCandidateForm = styled.div`
  margin-top: 1rem;
  border-radius: 0.25rem;
  background-color: rgb(211, 211, 211);
  padding: 0.25rem;
`;

const WriteInCandidateFieldSet = styled.div`
  margin: 0 0.5rem 0.5rem;
`;

const WriteInCandidateName = styled.div`
  border: 1px solid rgb(169, 169, 169);
  box-shadow: 0 0 3px -1px rgba(0, 0, 0, 0.3);
  background: #ffffff;
  width: 100%;
  padding: 1rem;
  font-size: 1.5rem;
`;

const WriteInCandidateCursor = styled(Blink)`
  display: inline-block;
  position: relative;
  top: 3px;
  margin-left: 0.1rem;
  border-left: 0.15rem solid #000000;
  height: 1.3rem;
`;

interface Props {
  contest: CandidateContestInterface;
  parties: Parties;
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
  contest,
  parties,
  vote,
  updateVote,
}: Props): JSX.Element {
  const { electionDefinition, precinctId, userSettings } = useContext(
    BallotContext
  );
  assert(userSettings, 'userSettings is required to render CandidateContest');
  assert(
    electionDefinition,
    'electionDefinition is required to render CandidateContest'
  );
  assert(
    typeof precinctId === 'string',
    'precinctId is required to render ContestPage'
  );
  const { election } = electionDefinition;
  const scrollContainer = useRef<HTMLDivElement>(null);

  const [
    attemptedOvervoteCandidate,
    setAttemptedOvervoteCandidate,
  ] = useState<Candidate>();
  const [
    candidatePendingRemoval,
    setCandidatePendingRemoval,
  ] = useState<Candidate>();
  const [isScrollable, setIsScrollable] = useState(false);
  const [isScrollAtBottom, setIsScrollAtBottom] = useState(true);
  const [isScrollAtTop, setIsScrollAtTop] = useState(true);
  const [
    writeInCandidateModalIsOpen,
    setWriteInCandidateModalIsOpen,
  ] = useState(false);
  const [writeInCandidateName, setWriteInCandidateName] = useState('');
  const [deselectedCandidate, setDeselectedCandidate] = useState('');

  const updateContestChoicesScrollStates = useCallback(() => {
    const target = scrollContainer.current;
    /* istanbul ignore next - `target` should always exist, but sometimes it doesn't. Don't know how to create this condition in testing.  */
    if (!target) {
      return;
    }
    const targetMinHeight = FONT_SIZES[userSettings.textSize] * 8; // magic number: room for buttons + spacing
    const windowsScrollTopOffsetMagicNumber = 1; // Windows Chrome is often 1px when using scroll buttons.
    const windowsScrollTop = Math.ceil(target.scrollTop); // Windows Chrome scrolls to sub-pixel values.
    setIsScrollable(
      /* istanbul ignore next: Tested by Cypress */
      target.scrollHeight > target.offsetHeight &&
        /* istanbul ignore next: Tested by Cypress */
        target.offsetHeight > targetMinHeight
    );
    setIsScrollAtBottom(
      windowsScrollTop +
        target.offsetHeight +
        windowsScrollTopOffsetMagicNumber >= // Windows Chrome "gte" check.
        target.scrollHeight
    );
    setIsScrollAtTop(target.scrollTop === 0);
  }, [scrollContainer, userSettings.textSize]);

  useEffect(() => {
    updateContestChoicesScrollStates();
    window.addEventListener('resize', updateContestChoicesScrollStates);
    return () => {
      window.removeEventListener('resize', updateContestChoicesScrollStates);
    };
  }, [vote.length, updateContestChoicesScrollStates]);

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

  const handleUpdateSelection: EventTargetFunction = (event) => {
    const candidateId = (event.currentTarget as HTMLInputElement).dataset
      .choice;
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
  };

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
    const normalizedCandidateName = normalizeCandidateName(
      writeInCandidateName
    );
    updateVote(contest.id, [
      ...vote,
      {
        id: `write-in__${camelCase(normalizedCandidateName)}`,
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

  const onKeyboardInput: EventTargetFunction = (event) => {
    const { key } = (event.target as HTMLElement).dataset;
    setWriteInCandidateName((prevName) => {
      let newName = prevName;
      if (key === 'space') {
        newName += ' ';
      } else if (key === '⌫ delete') {
        newName = newName.slice(0, -1);
      } else {
        newName += key;
      }
      return newName.slice(0, WRITE_IN_CANDIDATE_MAX_LENGTH);
    });
  };

  function keyDisabled(key: string) {
    return (
      writeInCandidateName.length >= WRITE_IN_CANDIDATE_MAX_LENGTH &&
      key !== '⌫ delete'
    );
  }

  /* istanbul ignore next: Tested by Cypress */
  const scrollContestChoices: EventTargetFunction = (event) => {
    const direction = (event.target as HTMLElement).dataset
      .direction as ScrollDirections;
    const sc = scrollContainer.current;
    assert(sc);
    const currentScrollTop = sc.scrollTop;
    const { offsetHeight } = sc;
    const { scrollHeight } = sc;
    const idealScrollDistance = Math.round(offsetHeight * 0.75);
    const maxScrollableDownDistance =
      scrollHeight - offsetHeight - currentScrollTop;
    const maxScrollTop =
      direction === 'down'
        ? currentScrollTop + maxScrollableDownDistance
        : currentScrollTop;
    const idealScrollTop =
      direction === 'down'
        ? currentScrollTop + idealScrollDistance
        : currentScrollTop - idealScrollDistance;
    const top = idealScrollTop > maxScrollTop ? maxScrollTop : idealScrollTop;
    sc.scrollTo({ behavior: 'smooth', left: 0, top });
  };

  function handleDisabledAddWriteInClick() {
    handleChangeVoteAlert({
      id: 'write-in',
      name: 'a write-in candidate',
    });
  }

  const hasReachedMaxSelections = contest.seats === vote.length;
  const precinctIndex = getPrecinctIndexById({ election, precinctId });
  const rotatedCandidates = getContestCandidatesInRotatedOrder({
    contest,
    precinctIndex,
  });

  return (
    <React.Fragment>
      <Main>
        <ContentHeader isCandidateStyle id="contest-header">
          <Prose id="audiofocus">
            <h1 aria-label={`${contest.section} ${contest.title}.`}>
              <ContestSection>{contest.section}</ContestSection>
              {contest.title}
            </h1>
            <p>
              <Text as="span">Vote for {contest.seats}.</Text>{' '}
              {vote.length === contest.seats && (
                <Text as="span" bold>
                  You have selected {contest.seats}.
                </Text>
              )}
              {vote.length < contest.seats && vote.length !== 0 && (
                <Text as="span" bold>
                  You may select {contest.seats - vote.length} more.
                </Text>
              )}
              <span className="screen-reader-only">
                To navigate through the contest choices, use the down button. To
                move to the next contest, use the right button.
              </span>
            </p>
          </Prose>
        </ContentHeader>
        <VariableContentContainer
          showTopShadow={!isScrollAtTop}
          showBottomShadow={!isScrollAtBottom}
        >
          <ScrollContainer
            ref={scrollContainer}
            onScroll={updateContestChoicesScrollStates}
          >
            <ScrollableContentWrapper isScrollable={isScrollable}>
              <ChoicesGrid>
                {rotatedCandidates.map((candidate) => {
                  const isChecked = !!findCandidateById(vote, candidate.id);
                  const isDisabled = hasReachedMaxSelections && !isChecked;
                  function handleDisabledClick() {
                    handleChangeVoteAlert(candidate);
                  }
                  const party =
                    candidate.partyId &&
                    findPartyById(parties, candidate.partyId);
                  let prefixAudioText = '';
                  if (isChecked) {
                    prefixAudioText = 'Selected,';
                  } else if (deselectedCandidate === candidate.id) {
                    prefixAudioText = 'Deselected,';
                  }
                  return (
                    <ChoiceButton
                      key={candidate.id}
                      isSelected={isChecked}
                      onPress={
                        isDisabled ? handleDisabledClick : handleUpdateSelection
                      }
                      choice={candidate.id}
                      aria-label={`${prefixAudioText} ${stripQuotes(
                        candidate.name
                      )}${party ? `, ${party.name}` : ''}.`}
                    >
                      <Prose>
                        <Text wordBreak>
                          <strong>{candidate.name}</strong>
                          {party && (
                            <React.Fragment>
                              <br />
                              {party.name}
                            </React.Fragment>
                          )}
                        </Text>
                      </Prose>
                    </ChoiceButton>
                  );
                })}
                {contest.allowWriteIns &&
                  vote
                    .filter((c) => c.isWriteIn)
                    .map((candidate) => {
                      return (
                        <ChoiceButton
                          key={candidate.id}
                          isSelected
                          choice={candidate.id}
                          onPress={handleUpdateSelection}
                        >
                          <Prose>
                            <p
                              aria-label={`Selected, write-in: ${candidate.name}.`}
                            >
                              <strong>{candidate.name}</strong>
                            </p>
                          </Prose>
                        </ChoiceButton>
                      );
                    })}
                {contest.allowWriteIns && (
                  <ChoiceButton
                    choice="write-in"
                    isSelected={false}
                    onPress={
                      hasReachedMaxSelections
                        ? handleDisabledAddWriteInClick
                        : initWriteInCandidate
                    }
                  >
                    <Prose>
                      <p aria-label="add write-in candidate.">
                        <em>add write-in candidate</em>
                      </p>
                    </Prose>
                  </ChoiceButton>
                )}
              </ChoicesGrid>
            </ScrollableContentWrapper>
          </ScrollContainer>
          {
            /* istanbul ignore next: Tested by Cypress */ isScrollable && (
              <ScrollControls aria-hidden>
                <Button
                  className="scroll-up"
                  large
                  primary
                  aria-hidden
                  data-direction="up"
                  disabled={isScrollAtTop}
                  onPress={scrollContestChoices}
                >
                  <span>See More</span>
                </Button>
                <Button
                  className="scroll-down"
                  large
                  primary
                  aria-hidden
                  data-direction="down"
                  disabled={isScrollAtBottom}
                  onPress={scrollContestChoices}
                >
                  <span>See More</span>
                </Button>
              </ScrollControls>
            )
          }
        </VariableContentContainer>
      </Main>
      {attemptedOvervoteCandidate && (
        <Modal
          ariaLabel=""
          centerContent
          content={
            <Prose>
              <Text id="modalaudiofocus">
                You may only select {contest.seats}{' '}
                {contest.seats === 1 ? 'candidate' : 'candidates'} in this
                contest. To vote for {attemptedOvervoteCandidate?.name}, you
                must first unselect the selected{' '}
                {contest.seats === 1 ? 'candidate' : 'candidates'}.
                <span aria-label="Use the select button to continue." />
              </Text>
            </Prose>
          }
          actions={
            <Button
              primary
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
              <Text id="modalaudiofocus">
                Do you want to unselect and remove{' '}
                {candidatePendingRemoval?.name}?
              </Text>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button danger onPress={confirmRemovePendingWriteInCandidate}>
                Yes, Remove.
              </Button>
              <Button onPress={clearCandidateIdPendingRemoval}>Cancel</Button>
            </React.Fragment>
          }
        />
      )}
      {writeInCandidateModalIsOpen && (
        <Modal
          ariaLabel=""
          content={
            <WriteInModalContent>
              <Prose id="modalaudiofocus" maxWidth={false}>
                <h1 aria-label="Write-In Candidate.">Write-In Candidate</h1>
                <Text aria-label="Enter the name of a person who is not on the ballot. Use the up and down buttons to navigate between the letters of a standard keyboard. Use the select button to select the current letter.">
                  Enter the name of a person who is <strong>not</strong> on the
                  ballot.
                </Text>
                {writeInCandidateName.length >
                  WRITE_IN_CANDIDATE_MAX_LENGTH - 5 && (
                  <Text error>
                    <strong>Note:</strong> You have entered{' '}
                    {writeInCandidateName.length} of maximum{' '}
                    {WRITE_IN_CANDIDATE_MAX_LENGTH} characters.
                  </Text>
                )}
              </Prose>
              <WriteInCandidateForm>
                <WriteInCandidateFieldSet>
                  <Prose>
                    <h3>{contest.title} (write-in)</h3>
                  </Prose>
                  <WriteInCandidateName>
                    {writeInCandidateName}
                    <WriteInCandidateCursor />
                  </WriteInCandidateName>
                </WriteInCandidateFieldSet>
                <VirtualKeyboard
                  onKeyPress={onKeyboardInput}
                  keyDisabled={keyDisabled}
                />
              </WriteInCandidateForm>
            </WriteInModalContent>
          }
          actions={
            <React.Fragment>
              <Button
                primary={
                  normalizeCandidateName(writeInCandidateName).length > 0
                }
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
