import camelCase from 'lodash.camelcase';
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import {
  BallotStyleId,
  Candidate,
  CandidateId,
  CandidateVote,
  CandidateContest as CandidateContestInterface,
  Election,
  getBallotStyle,
  getContestDistrict,
  getOrderedCandidatesForContestInBallotStyle,
  PartyId,
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
  appStrings,
  CandidatePartyList,
  NumberString,
  AudioOnly,
  electionStrings,
  ReadOnLoad,
  AssistiveTechInstructions,
  PageNavigationButtonId,
  ScanPanelVirtualKeyboard,
  AccessibilityMode,
  Font,
  virtualKeyboardCommon,
  useIsPatDeviceConnected,
} from '@votingworks/ui';
import { assert, assertDefined, deepEqual } from '@votingworks/basics';

import { deriveStraightPartyVotesForContest } from '@votingworks/utils';
import { UpdateVoteFunction } from '../config/types';

import { WRITE_IN_CANDIDATE_MAX_LENGTH } from '../config/globals';
import { ChoicesGrid } from './contest_screen_layout';
import { ContestHeader } from './contest_header';
import { WriteInCandidateName } from './write_in_candidate_name';
import { numVotesRemaining } from '../utils/vote';

export interface WriteInCharacterLimitAcrossContests {
  numCharactersAllowed: number;
  numCharactersRemaining: number;
}

interface Props {
  ballotStyleId: BallotStyleId;
  election: Election;
  contest: CandidateContestInterface;
  vote: CandidateVote;
  updateVote: UpdateVoteFunction;
  accessibilityMode?: AccessibilityMode;
  onOpenWriteInKeyboard?: () => void;
  onCloseWriteInKeyboard?: () => void;
  writeInCharacterLimitAcrossContests?: WriteInCharacterLimitAcrossContests;
  isReviewMode?: boolean;
  selectedStraightPartyId?: PartyId;
}

const WriteInForm = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  justify-content: center;
  flex-shrink: 1;
  max-width: 100%;
`;

function areCandidateChoicesEqual(a: Candidate, b: Candidate): boolean {
  const partiesA = (a.partyIds ?? []).toSorted();
  const partiesB = (b.partyIds ?? []).toSorted();
  return a.id === b.id && deepEqual(partiesA, partiesB);
}

/**
 * Finds a candidate in the vote array that matches both the ID and partyIds.
 * For cross-endorsed candidates, this ensures we match the specific party
 * version that was selected.
 */
function findCandidateInVote(
  vote: readonly Candidate[],
  candidate: Candidate
): Candidate | undefined {
  return vote.find((c) => {
    if (c.id !== candidate.id) return false;
    return areCandidateChoicesEqual(c, candidate);
  });
}

function findCandidateInVoteWithAnyParty(
  vote: readonly Candidate[],
  candidateId: CandidateId
): Candidate | undefined {
  return vote.find((c) => c.id === candidateId);
}

function normalizeCandidateName(name: string) {
  return name.trim().replace(/\t+/g, ' ').replace(/\s+/g, ' ');
}

export function CandidateContest({
  ballotStyleId,
  election,
  contest,
  vote,
  updateVote,
  accessibilityMode = AccessibilityMode.ATI_CONTROLLER,
  onOpenWriteInKeyboard,
  onCloseWriteInKeyboard,
  writeInCharacterLimitAcrossContests,
  isReviewMode,
  selectedStraightPartyId,
}: Props): JSX.Element {
  const district = getContestDistrict(election, contest);
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  assert(ballotStyle);
  const orderedCandidates = getOrderedCandidatesForContestInBallotStyle({
    contest,
    ballotStyle,
  });

  const [attemptedOvervoteCandidate, setAttemptedOvervoteCandidate] =
    useState<Candidate>();
  const [writeInPendingRemoval, setWriteInPendingRemoval] =
    useState<Candidate>();
  const [writeInCandidateModalIsOpen, setWriteInCandidateModalIsOpen] =
    useState(false);
  const [writeInCandidateName, setWriteInCandidateName] = useState('');
  const [recentlyDeselectedCandidate, setRecentlyDeselectedCandidate] =
    useState<Candidate | undefined>(undefined);
  const [recentlySelectedCandidate, setRecentlySelectedCandidate] = useState<
    Candidate | undefined
  >(undefined);

  const pendingFocusWriteInId = useRef<string | null>(null);
  const acceptButtonRef = useRef<Button>(null);
  const cancelButtonRef = useRef<Button>(null);

  const writeInCharacterLimit = Math.min(
    WRITE_IN_CANDIDATE_MAX_LENGTH,
    writeInCharacterLimitAcrossContests?.numCharactersRemaining ?? Infinity
  );
  const writeInCharacterLimitAcrossContestsIsLimitingFactor =
    writeInCharacterLimit < WRITE_IN_CANDIDATE_MAX_LENGTH;

  const isPatDeviceConnected = useIsPatDeviceConnected();

  const derivedStraightPartyVotes = deriveStraightPartyVotesForContest(
    contest,
    vote.map((c) => c.id),
    selectedStraightPartyId
  );
  const votesRemaining = numVotesRemaining(contest, vote);
  const votesRemainingIncludingDerivedVotes =
    votesRemaining - derivedStraightPartyVotes.length;

  useEffect(() => {
    if (recentlyDeselectedCandidate) {
      const timer = setTimeout(() => {
        setRecentlyDeselectedCandidate(undefined);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [recentlyDeselectedCandidate]);

  useEffect(() => {
    if (recentlySelectedCandidate) {
      const timer = setTimeout(() => {
        setRecentlySelectedCandidate(undefined);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [recentlySelectedCandidate]);

  useEffect(() => {
    if (pendingFocusWriteInId.current && !writeInCandidateModalIsOpen) {
      const candidateId = pendingFocusWriteInId.current;
      pendingFocusWriteInId.current = null;
      // When the contest is fully voted, ContestPage auto-focuses the Next
      // button for PAT navigation. Don't override that.
      if (votesRemainingIncludingDerivedVotes > 0 || !isPatDeviceConnected) {
        const button = document.querySelector<HTMLElement>(
          `[data-write-in-id="${candidateId}"] button`
        );
        button?.focus();
      }
    }
  }, [
    writeInCandidateModalIsOpen,
    votesRemainingIncludingDerivedVotes,
    isPatDeviceConnected,
  ]);

  function addCandidateToVote(candidate: Candidate) {
    // Store the candidate with the specific partyIds from the selected option
    updateVote(contest.id, [...vote, candidate]);
    setRecentlySelectedCandidate(candidate);
  }

  function removeCandidateFromVote(candidate: Candidate) {
    const newVote: Candidate[] = [];

    let nextWriteInIndex = 0;
    for (const c of vote) {
      if (areCandidateChoicesEqual(c, candidate)) continue;

      if (!c.isWriteIn) {
        newVote.push(c);
        continue;
      }

      newVote.push({ ...c, writeInIndex: nextWriteInIndex });
      nextWriteInIndex += 1;
    }

    updateVote(contest.id, newVote);
    setRecentlyDeselectedCandidate(candidate);
  }

  function handleUpdateSelection(candidate: Candidate) {
    const candidateInVote = findCandidateInVote(vote, candidate);

    if (candidateInVote) {
      if (candidateInVote.isWriteIn) {
        setWriteInPendingRemoval(candidateInVote);
      } else {
        removeCandidateFromVote(candidate);
      }
    } else {
      addCandidateToVote(candidate);
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

  function confirmRemovePendingWriteInCandidate() {
    assert(writeInPendingRemoval);
    removeCandidateFromVote(writeInPendingRemoval);
    clearWriteInPendingRemoval();
  }

  function toggleWriteInCandidateModal(newValue: boolean) {
    setWriteInCandidateModalIsOpen(newValue);
    if (newValue && onOpenWriteInKeyboard) {
      onOpenWriteInKeyboard();
    } else if (!newValue && onCloseWriteInKeyboard) {
      onCloseWriteInKeyboard();
    }
  }

  function initWriteInCandidate() {
    toggleWriteInCandidateModal(true);
  }

  function addWriteInCandidate() {
    const normalizedCandidateName =
      normalizeCandidateName(writeInCandidateName);

    let writeInIndex = 0;
    for (const c of vote) {
      if (!c.isWriteIn) continue;

      writeInIndex = Math.max(writeInIndex, assertDefined(c.writeInIndex) + 1);
    }

    const newCandidateId = `write-in-${camelCase(normalizedCandidateName)}`;
    pendingFocusWriteInId.current = newCandidateId;

    updateVote(contest.id, [
      ...vote,
      {
        id: newCandidateId,
        isWriteIn: true,
        name: normalizedCandidateName,
        writeInIndex,
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
    setWriteInCandidateName((prevName) =>
      (prevName + key)
        .trimStart()
        .replace(/\s+/g, ' ')
        .slice(0, writeInCharacterLimit)
    );
  }

  function onKeyboardBackspace() {
    setWriteInCandidateName((prevName) =>
      prevName.slice(0, Math.max(0, prevName.length - 1))
    );
  }

  const writeInCharactersRemaining =
    writeInCharacterLimit - writeInCandidateName.length;

  function keyDisabled(key: virtualKeyboardCommon.Key) {
    if (key.action === virtualKeyboardCommon.ActionKey.DELETE) {
      return false;
    }
    return writeInCharactersRemaining === 0;
  }

  function handleDisabledAddWriteInClick() {
    handleChangeVoteAlert({
      id: 'write-in',
      name: 'a write-in candidate',
    });
  }

  const writeInModalTitle = (
    <React.Fragment>
      {appStrings.labelWriteInTitleCaseColon()}{' '}
      {electionStrings.contestTitle(contest)}
    </React.Fragment>
  );

  const modalActions = (
    <React.Fragment>
      <Button
        variant="primary"
        icon="Done"
        onPress={addWriteInCandidate}
        disabled={normalizeCandidateName(writeInCandidateName).length === 0}
        ref={acceptButtonRef}
      >
        {appStrings.buttonAccept()}
      </Button>
      <Button onPress={cancelWriteInCandidateModal} ref={cancelButtonRef}>
        {appStrings.buttonCancel()}
      </Button>
    </React.Fragment>
  );

  return (
    <React.Fragment>
      <Main flexColumn>
        <ContestHeader contest={contest} district={district}>
          {contest.termDescription && (
            <Font style={{ display: 'block' }} weight="bold">
              {electionStrings.contestTerm(contest)}
            </Font>
          )}
          <Caption>
            {appStrings.labelNumVotesRemaining()}{' '}
            <NumberString
              value={votesRemainingIncludingDerivedVotes}
              weight="bold"
            />
            <AudioOnly>
              <AssistiveTechInstructions
                controllerString={
                  isReviewMode
                    ? appStrings.instructionsBmdContestNavigationReviewMode()
                    : appStrings.instructionsBmdContestNavigation()
                }
                patDeviceString={
                  isReviewMode
                    ? appStrings.instructionsBmdContestNavigationReviewModePatDevice()
                    : appStrings.instructionsBmdContestNavigationPatDevice()
                }
              />
            </AudioOnly>
          </Caption>
          {derivedStraightPartyVotes.length > 0 && (
            <AudioOnly>
              {appStrings.noteBmdStraightPartyAppliesToContest()}
            </AudioOnly>
          )}
        </ContestHeader>
        <WithScrollButtons>
          <ChoicesGrid>
            {orderedCandidates.map((candidate) => {
              const isChecked = !!findCandidateInVote(vote, candidate);
              // In the case of a cross-endorsed candidate, we consider any
              // version of that candidate as equivalent in tabulation and the voter
              // may select multiple versions without it impacting the number of selections / overvote trigger.
              const isEquivalentToSelected = findCandidateInVoteWithAnyParty(
                vote,
                candidate.id
              );
              const isDisabled =
                votesRemaining <= 0 && !isChecked && !isEquivalentToSelected;
              const isDerivedVote = derivedStraightPartyVotes.includes(
                candidate.id
              );
              const matchesSelectedStraightParty =
                selectedStraightPartyId &&
                candidate.partyIds?.includes(selectedStraightPartyId);

              function handleDisabledClick() {
                handleChangeVoteAlert(candidate);
              }
              let prefixAudioText: ReactNode = null;
              let suffixAudioText: ReactNode = null;

              if (isChecked || isDerivedVote) {
                prefixAudioText = appStrings.labelSelected();

                if (
                  recentlySelectedCandidate &&
                  areCandidateChoicesEqual(recentlySelectedCandidate, candidate)
                ) {
                  suffixAudioText =
                    votesRemainingIncludingDerivedVotes > 0 ? (
                      <React.Fragment>
                        {appStrings.labelNumVotesRemaining()}{' '}
                        <NumberString
                          value={votesRemainingIncludingDerivedVotes}
                          weight="bold"
                        />
                      </React.Fragment>
                    ) : (
                      appStrings.noteBmdContestCompleted()
                    );
                }
              } else if (
                recentlyDeselectedCandidate &&
                areCandidateChoicesEqual(recentlyDeselectedCandidate, candidate)
              ) {
                prefixAudioText = appStrings.labelDeselected();

                suffixAudioText = (
                  <React.Fragment>
                    {appStrings.labelNumVotesRemaining()}{' '}
                    <NumberString
                      value={votesRemainingIncludingDerivedVotes}
                      weight="bold"
                    />
                  </React.Fragment>
                );
              }

              return (
                <ContestChoiceButton
                  key={candidate.id + (candidate.partyIds ?? []).join('-')}
                  isSelected={isChecked}
                  isDerivedVote={isDerivedVote}
                  onPress={
                    isDisabled ? handleDisabledClick : handleUpdateSelection
                  }
                  choice={candidate}
                  label={
                    <React.Fragment>
                      <AudioOnly>{prefixAudioText}</AudioOnly>
                      {electionStrings.candidateName(candidate)}
                    </React.Fragment>
                  }
                  caption={
                    <React.Fragment>
                      <CandidatePartyList
                        candidate={candidate}
                        electionParties={election.parties}
                      />
                      {matchesSelectedStraightParty && (
                        <span>
                          {' - '}
                          {appStrings.labelStraightPartyVote()}
                        </span>
                      )}
                      <AudioOnly>{suffixAudioText}</AudioOnly>
                    </React.Fragment>
                  }
                />
              );
            })}
            {contest.allowWriteIns &&
              vote
                .filter((c) => c.isWriteIn)
                .map((candidate) => (
                  <span
                    key={candidate.id}
                    style={{ display: 'contents' }}
                    data-write-in-id={candidate.id}
                  >
                    <ContestChoiceButton
                      isSelected
                      choice={candidate}
                      onPress={handleUpdateSelection}
                      label={
                        <Font breakWord>
                          <AudioOnly>
                            {appStrings.labelSelected()}
                            <WriteInCandidateName name={candidate.name} />
                          </AudioOnly>
                          {/* User-generated content - no translation/audio available: */}
                          {candidate.name}
                        </Font>
                      }
                      caption={appStrings.labelWriteInTitleCase()}
                    />
                  </span>
                ))}
            {contest.allowWriteIns && (
              <ContestChoiceButton
                choice="write-in"
                isSelected={false}
                onPress={
                  votesRemaining <= 0
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
            <P>
              {appStrings.warningOvervoteCandidateContest()}
              <AudioOnly>
                <AssistiveTechInstructions
                  controllerString={appStrings.instructionsBmdNextToContinue()}
                  patDeviceString={appStrings.instructionsBmdMoveToSelectToContinuePatDevice()}
                />
              </AudioOnly>
            </P>
          }
          actions={
            <Button
              variant="primary"
              autoFocus
              onPress={closeAttemptedVoteAlert}
              id={PageNavigationButtonId.NEXT}
            >
              {appStrings.buttonContinue()}
              <AudioOnly>
                <AssistiveTechInstructions
                  controllerString={appStrings.instructionsBmdSelectToContinue()}
                  patDeviceString={appStrings.instructionsBmdSelectToContinuePatDevice()}
                />
              </AudioOnly>
            </Button>
          }
        />
      )}
      {writeInPendingRemoval && (
        <Modal
          centerContent
          content={<P>{appStrings.promptBmdConfirmRemoveWriteIn()}</P>}
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
          disableAutoplayAudio
          title={writeInModalTitle}
          actions={modalActions}
          content={
            <div>
              <div>
                <P>
                  <Caption>
                    <Icons.Info /> {appStrings.labelBmdWriteInForm()}
                  </Caption>
                </P>
              </div>
              <WriteInForm>
                <TouchTextInput value={writeInCandidateName} />
                <ReadOnLoad>
                  {/*
                   * Re-render the modal title and form label as hidden,
                   * audio-only elements to enable grouping together content
                   * that needs to be read on modal open:
                   */}
                  <AudioOnly>
                    {writeInModalTitle}
                    {appStrings.labelBmdWriteInForm()}
                    <AssistiveTechInstructions
                      controllerString={appStrings.instructionsBmdWriteInFormNavigation()}
                      patDeviceString={appStrings.instructionsBmdWriteInFormNavigationPatDevice()}
                    />
                  </AudioOnly>
                  <P align="right">
                    <Caption>
                      {writeInCharactersRemaining === 0 && (
                        <Icons.Warning color="warning" />
                      )}{' '}
                      {appStrings.labelCharactersRemaining()}{' '}
                      <NumberString value={writeInCharactersRemaining} />
                      {writeInCharacterLimitAcrossContestsIsLimitingFactor && (
                        <React.Fragment>
                          {' | '}
                          {appStrings.labelWriteInCharacterLimitAcrossContests()}{' '}
                          <NumberString
                            value={
                              assertDefined(writeInCharacterLimitAcrossContests)
                                .numCharactersAllowed
                            }
                          />
                        </React.Fragment>
                      )}
                    </Caption>
                  </P>
                </ReadOnLoad>
                {accessibilityMode === AccessibilityMode.SWITCH_SCANNING ? (
                  <ScanPanelVirtualKeyboard
                    onBackspace={onKeyboardBackspace}
                    onKeyPress={onKeyboardInput}
                    keyDisabled={keyDisabled}
                  />
                ) : (
                  <VirtualKeyboard
                    onBackspace={onKeyboardBackspace}
                    onKeyPress={onKeyboardInput}
                    keyDisabled={keyDisabled}
                    onExitBottom={() => {
                      const accept = acceptButtonRef.current;
                      const cancel = cancelButtonRef.current;
                      (accept?.props.disabled ? cancel : accept)?.focus();
                    }}
                    onExitTop={() => {
                      cancelButtonRef.current?.focus();
                    }}
                  />
                )}
              </WriteInForm>
            </div>
          }
        />
      )}
    </React.Fragment>
  );
}
