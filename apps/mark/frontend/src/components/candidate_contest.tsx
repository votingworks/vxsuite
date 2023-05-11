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
  getCandidatePartiesDescription,
  getContestDistrictName,
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
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';

import pluralize from 'pluralize';
import { stripQuotes } from '../utils/strip_quotes';

import { ScrollDirections, UpdateVoteFunction } from '../config/types';

import { BallotContext } from '../contexts/ballot_context';

import { WRITE_IN_CANDIDATE_MAX_LENGTH } from '../config/globals';
import {
  ContentHeader,
  VariableContentContainer,
  ScrollControls,
  ScrollContainer,
  ScrollableContentWrapper,
  ChoicesGrid,
} from './contest_screen_layout';
import { useCurrentTextSizePx } from '../hooks/use_current_text_size';
import { ContestTitle } from './contest_title';

const WriteInModalContent = styled.div``;

interface Props {
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
  contest,
  vote,
  updateVote,
}: Props): JSX.Element {
  const { electionDefinition, precinctId } = useContext(BallotContext);
  const textSizePx = useCurrentTextSizePx();
  assert(
    electionDefinition,
    'electionDefinition is required to render CandidateContest'
  );
  assert(
    typeof precinctId === 'string',
    'precinctId is required to render ContestPage'
  );
  const { election } = electionDefinition;
  const districtName = getContestDistrictName(election, contest);
  const scrollContainer = useRef<HTMLDivElement>(null);

  const [attemptedOvervoteCandidate, setAttemptedOvervoteCandidate] =
    useState<Candidate>();
  const [candidatePendingRemoval, setCandidatePendingRemoval] =
    useState<Candidate>();
  const [isScrollable, setIsScrollable] = useState(false);
  const [isScrollAtBottom, setIsScrollAtBottom] = useState(true);
  const [isScrollAtTop, setIsScrollAtTop] = useState(true);
  const [writeInCandidateModalIsOpen, setWriteInCandidateModalIsOpen] =
    useState(false);
  const [writeInCandidateName, setWriteInCandidateName] = useState('');
  const [deselectedCandidate, setDeselectedCandidate] = useState('');

  const updateContestChoicesScrollStates = useCallback(() => {
    const target = scrollContainer.current;
    /* istanbul ignore next - `target` should always exist, but sometimes it doesn't. Don't know how to create this condition in testing.  */
    if (!target) {
      return;
    }
    const targetMinHeight = textSizePx * 8; // magic number: room for buttons + spacing
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
  }, [scrollContainer, textSizePx]);

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

  /* istanbul ignore next: Tested by Cypress */
  function scrollContestChoices(direction: ScrollDirections) {
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
                      )}${
                        partiesDescription ? `, ${partiesDescription}` : ''
                      }.`}
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
            </ScrollableContentWrapper>
          </ScrollContainer>
          {
            /* istanbul ignore next: Tested by Cypress */ isScrollable && (
              <ScrollControls aria-hidden>
                <Button
                  className="scroll-up"
                  large
                  variant="primary"
                  aria-hidden
                  value="up"
                  disabled={isScrollAtTop}
                  onPress={scrollContestChoices}
                >
                  <span>See More</span>
                </Button>
                <Button
                  className="scroll-down"
                  large
                  variant="primary"
                  aria-hidden
                  value="down"
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
