import camelCase from 'lodash.camelcase';
import React, { ReactNode, useEffect, useState } from 'react';
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
  ReadOnLoad,
  AssistiveTechInstructions,
  PageNavigationButtonId,
  ScanPanelVirtualKeyboard,
  AccessibilityMode,
  Font,
  virtualKeyboardCommon,
} from '@votingworks/ui';
import { assert, assertDefined, deepEqual } from '@votingworks/basics';

import { UpdateVoteFunction } from '../config/types';

import { WRITE_IN_CANDIDATE_MAX_LENGTH } from '../config/globals';
import { ChoicesGrid } from './contest_screen_layout';
import { BreadcrumbMetadata, ContestHeader } from './contest_header';
import { WriteInCandidateName } from './write_in_candidate_name';
import { numVotesRemainingAndExceeding } from '../utils/vote';

export interface WriteInCharacterLimitAcrossContests {
  numCharactersAllowed: number;
  numCharactersRemaining: number;
}

interface Props {
  breadcrumbs?: BreadcrumbMetadata;
  ballotStyleId: BallotStyleId;
  election: Election;
  contest: CandidateContestInterface;
  vote: CandidateVote;
  updateVote: UpdateVoteFunction;
  accessibilityMode?: AccessibilityMode;
  onOpenWriteInKeyboard?: () => void;
  onCloseWriteInKeyboard?: () => void;
  writeInCharacterLimitAcrossContests?: WriteInCharacterLimitAcrossContests;
  /** When true, allow selections beyond seats (overvotes) with a warning modal. */
  allowOvervotes?: boolean;
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
  breadcrumbs,
  ballotStyleId,
  election,
  contest,
  vote,
  updateVote,
  accessibilityMode,
  onOpenWriteInKeyboard,
  onCloseWriteInKeyboard,
  writeInCharacterLimitAcrossContests,
  allowOvervotes,
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
  // Track overvote creation moment: we show modal only when transitioning from at-capacity to first overvote.

  const screenInfo = useScreenInfo();

  const writeInCharacterLimit = Math.min(
    WRITE_IN_CANDIDATE_MAX_LENGTH,
    writeInCharacterLimitAcrossContests?.numCharactersRemaining ?? Infinity
  );
  const writeInCharacterLimitAcrossContestsIsLimitingFactor =
    writeInCharacterLimit < WRITE_IN_CANDIDATE_MAX_LENGTH;

  const [votesRemaining, votesExceeding] = numVotesRemainingAndExceeding(
    contest,
    vote
  );
  const writeInCount = vote.filter((c) => c.isWriteIn).length;
  const canAddWriteIn = contest.allowWriteIns && writeInCount < contest.seats; // You can not add more write-ins than the number of seats.

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
      // Deselect the candidate.
      if (candidateInVote.isWriteIn) {
        setWriteInPendingRemoval(candidateInVote);
      } else {
        removeCandidateFromVote(candidate);
      }
    } else {
      // Select the candidate.
      // If this selection would create an overvote and they're not equivalent selections,
      // allow it only when allowOvervotes is enabled. Show a one-time warning.
      const isEquivalentToSelected = !!findCandidateInVoteWithAnyParty(
        vote,
        candidate.id
      );
      if (allowOvervotes && votesRemaining === 0 && !isEquivalentToSelected) {
        // We are allowing overvotes and this vote results in an overvote, add and show modal
        addCandidateToVote(candidate);
        handleChangeVoteAlert(candidate);
      } else {
        addCandidateToVote(candidate);
      }
    }
  }

  function handleChangeVoteAlert(candidate?: Candidate) {
    setAttemptedOvervoteCandidate(candidate);
  }

  function closeAttemptedVoteAlert() {
    // Re-trigger audio cue for the newly selected candidate after closing the modal
    if (
      attemptedOvervoteCandidate &&
      findCandidateInVote(vote, attemptedOvervoteCandidate)
    ) {
      setRecentlySelectedCandidate(attemptedOvervoteCandidate);
    }
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

    // Show modal whenever adding a write-in constitutes an overvote action (at-capacity -> over, or already over)
    const shouldShowOvervoteAfterAdd = allowOvervotes && votesRemaining === 0;

    let writeInIndex = 0;
    for (const c of vote) {
      if (!c.isWriteIn) continue;

      writeInIndex = Math.max(writeInIndex, assertDefined(c.writeInIndex) + 1);
    }

    const newWriteInCandidate: Candidate = {
      id: `write-in-${camelCase(normalizedCandidateName)}`,
      isWriteIn: true,
      name: normalizedCandidateName,
      writeInIndex,
    };

    updateVote(contest.id, [...vote, newWriteInCandidate]);
    setRecentlySelectedCandidate(newWriteInCandidate);
    setWriteInCandidateName('');
    toggleWriteInCandidateModal(false);

    if (shouldShowOvervoteAfterAdd) {
      handleChangeVoteAlert(newWriteInCandidate);
    }
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
    switch (key.action) {
      case virtualKeyboardCommon.ActionKey.ACCEPT:
        return writeInCandidateName.length === 0;

      case virtualKeyboardCommon.ActionKey.CANCEL:
        return false;

      case virtualKeyboardCommon.ActionKey.DELETE:
        return false;

      default:
        return writeInCharactersRemaining === 0;
    }
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
          {contest.termDescription && (
            <Font style={{ display: 'block' }} weight="bold">
              {electionStrings.contestTerm(contest)}
            </Font>
          )}
          <Caption>
            {votesExceeding > 0 ? (
              <React.Fragment>
                {appStrings.labelNumVotesOverLimit()}{' '}
                <NumberString value={votesExceeding} weight="bold" />
              </React.Fragment>
            ) : (
              <React.Fragment>
                {appStrings.labelNumVotesRemaining()}{' '}
                <NumberString value={votesRemaining} weight="bold" />
              </React.Fragment>
            )}
            <AudioOnly>
              <AssistiveTechInstructions
                controllerString={appStrings.instructionsBmdContestNavigation()}
                patDeviceString={appStrings.instructionsBmdContestNavigationPatDevice()}
              />
            </AudioOnly>
          </Caption>
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
                // We are blocking creating an overvote
                !allowOvervotes &&
                // An additional vote selection will create an overvote
                votesRemaining === 0 &&
                // This candidate option is not already selected
                !isChecked &&
                // This selection is not an alternative endorsement variant of a candidate that has been selected
                !isEquivalentToSelected;

              function handleDisabledClick() {
                handleChangeVoteAlert(candidate);
              }
              let prefixAudioText: ReactNode = null;
              let suffixAudioText: ReactNode = null;

              if (isChecked) {
                prefixAudioText = appStrings.labelSelected();

                if (
                  recentlySelectedCandidate &&
                  areCandidateChoicesEqual(recentlySelectedCandidate, candidate)
                ) {
                  // When in an overvote, announce votes remaining as 0 (Overvote) instead of "contest completed".
                  suffixAudioText =
                    votesExceeding > 0 ? (
                      <React.Fragment>
                        {appStrings.labelNumVotesOverLimit()}{' '}
                        <NumberString value={votesExceeding} weight="bold" />
                      </React.Fragment>
                    ) : votesRemaining > 0 ? (
                      <React.Fragment>
                        {appStrings.labelNumVotesRemaining()}{' '}
                        <NumberString value={votesRemaining} weight="bold" />
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

                suffixAudioText =
                  votesExceeding > 0 ? (
                    <React.Fragment>
                      {appStrings.labelNumVotesOverLimit()}{' '}
                      <NumberString value={votesExceeding} weight="bold" />
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      {appStrings.labelNumVotesRemaining()}{' '}
                      <NumberString value={votesRemaining} weight="bold" />
                    </React.Fragment>
                  );
              }

              return (
                <ContestChoiceButton
                  key={candidate.id + (candidate.partyIds ?? []).join('-')}
                  isSelected={isChecked}
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
                  <ContestChoiceButton
                    key={candidate.id}
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
                ))}
            {canAddWriteIn && (
              <ContestChoiceButton
                choice="write-in"
                isSelected={false}
                onPress={
                  votesRemaining <= 0 && !allowOvervotes
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
              {allowOvervotes ? (
                votesExceeding === 1 ? (
                  appStrings.infoAllowedOvervoteCandidateContestSingular()
                ) : (
                  <React.Fragment>
                    {appStrings.infoAllowedOvervoteCandidateContestPlural()}
                  </React.Fragment>
                )
              ) : (
                appStrings.warningOvervoteCandidateContest()
              )}
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
          content={
            <div>
              <div>
                <P>
                  <Caption>
                    <Icons.Info /> {appStrings.labelBmdWriteInForm()}
                  </Caption>
                </P>
              </div>
              <WriteInModalBody>
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
                                assertDefined(
                                  writeInCharacterLimitAcrossContests
                                ).numCharactersAllowed
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
                      onCancel={cancelWriteInCandidateModal}
                      onAccept={addWriteInCandidate}
                      keyDisabled={keyDisabled}
                      enableWriteInAtiControllerNavigation={
                        accessibilityMode === AccessibilityMode.ATI_CONTROLLER
                      }
                    />
                  )}
                </WriteInForm>
                {
                  // VirtualKeyboard renders its own actions to support accessible controller navigation.
                  !screenInfo.isPortrait &&
                    accessibilityMode !== AccessibilityMode.ATI_CONTROLLER && (
                      <WriteInModalActionsSidebar>
                        {modalActions}
                      </WriteInModalActionsSidebar>
                    )
                }
              </WriteInModalBody>
            </div>
          }
          actions={
            // VirtualKeyboard renders its own actions to support accessible controller navigation.
            screenInfo.isPortrait &&
            accessibilityMode !== AccessibilityMode.ATI_CONTROLLER
              ? modalActions
              : undefined
          }
        />
      )}
    </React.Fragment>
  );
}
