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
  H1,
  H3,
  Icons,
  Main,
  Modal,
  Prose,
  P,
  Font,
  Caption,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';

import { stripQuotes } from '../utils/strip_quotes';

import { ScrollDirections, UpdateVoteFunction } from '../config/types';

import { BallotContext } from '../contexts/ballot_context';

import { Blink } from './animations';
import { WRITE_IN_CANDIDATE_MAX_LENGTH } from '../config/globals';
import { VirtualKeyboard } from './virtual_keyboard';
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
  }

  function keyDisabled(key: string) {
    return (
      writeInCandidateName.length >= WRITE_IN_CANDIDATE_MAX_LENGTH &&
      key !== '⌫ delete'
    );
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
      {writeInCandidateModalIsOpen && (
        <Modal
          ariaLabel=""
          content={
            <WriteInModalContent>
              <Prose id="modalaudiofocus" maxWidth={false}>
                <H1 aria-label="Write-In Candidate.">Write-In Candidate</H1>
                <P aria-label="Enter the name of a person who is not on the ballot. Use the up and down buttons to navigate between the letters of a standard keyboard. Use the select button to select the current letter.">
                  Enter the name of a person who is{' '}
                  <Font weight="bold">not</Font> on the ballot.
                </P>
                {writeInCandidateName.length >
                  WRITE_IN_CANDIDATE_MAX_LENGTH - 5 && (
                  <P color="danger">
                    <Icons.Danger /> <Font>Note:</Font> You have entered{' '}
                    {writeInCandidateName.length} of maximum{' '}
                    {WRITE_IN_CANDIDATE_MAX_LENGTH} characters.
                  </P>
                )}
              </Prose>
              <WriteInCandidateForm>
                <WriteInCandidateFieldSet>
                  <Prose>
                    <H3>{contest.title} (write-in)</H3>
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
                variant="primary"
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
