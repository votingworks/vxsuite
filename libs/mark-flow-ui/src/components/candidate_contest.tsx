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
import { assert, assertDefined, unique } from '@votingworks/basics';

import { UpdateVoteFunction } from '../config/types';

import { WRITE_IN_CANDIDATE_MAX_LENGTH } from '../config/globals';
import { ChoicesGrid } from './contest_screen_layout';
import { BreadcrumbMetadata, ContestHeader } from './contest_header';
import { WriteInCandidateName } from './write_in_candidate_name';

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

/**
 * Creates a unique choice identifier for a candidate option that includes
 * party information to distinguish between multiple options for cross-endorsed
 * candidates.
 */
function getCandidateChoiceId(
  candidateId: CandidateId,
  partyIds?: readonly string[]
): string {
  if (!partyIds || partyIds.length === 0) {
    return candidateId;
  }
  // Sort party IDs to ensure consistent ordering
  return `${candidateId}|${[...partyIds].sort().join(',')}`;
}

/**
 * Finds a candidate in the vote array that matches both the ID and partyIds.
 * For cross-endorsed candidates, this ensures we match the specific party
 * version that was selected.
 */
function findCandidateInVote(
  vote: readonly Candidate[],
  candidateId: CandidateId,
  partyIds?: readonly string[]
): Candidate | undefined {
  return vote.find((c) => {
    if (c.id !== candidateId) return false;
    return (
      getCandidateChoiceId(c.id, c.partyIds) ===
      getCandidateChoiceId(candidateId, partyIds)
    );
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
    useState('');
  const [recentlySelectedCandidate, setRecentlySelectedCandidate] =
    useState('');

  const screenInfo = useScreenInfo();

  const writeInCharacterLimit = Math.min(
    WRITE_IN_CANDIDATE_MAX_LENGTH,
    writeInCharacterLimitAcrossContests?.numCharactersRemaining ?? Infinity
  );
  const writeInCharacterLimitAcrossContestsIsLimitingFactor =
    writeInCharacterLimit < WRITE_IN_CANDIDATE_MAX_LENGTH;

  const uniqueCandidatesSelected = unique(vote.map((c) => c.id)).length;
  const hasReachedMaxSelections = uniqueCandidatesSelected >= contest.seats;

  useEffect(() => {
    if (recentlyDeselectedCandidate !== '') {
      const timer = setTimeout(() => {
        setRecentlyDeselectedCandidate('');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [recentlyDeselectedCandidate]);

  useEffect(() => {
    if (recentlySelectedCandidate !== '') {
      const timer = setTimeout(() => {
        setRecentlySelectedCandidate('');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [recentlySelectedCandidate]);

  function addCandidateToVote(choiceId: string) {
    // Find the candidate in orderedCandidates to get the correct partyIds
    // for the specific option that was selected
    const orderedCandidate = orderedCandidates.find(
      (c) => getCandidateChoiceId(c.id, c.partyIds) === choiceId
    );
    assert(orderedCandidate, `Candidate not found for choice ${choiceId}`);

    // Store the candidate with the specific partyIds from the selected option
    updateVote(contest.id, [...vote, orderedCandidate]);
    setRecentlySelectedCandidate(choiceId);
  }

  function removeCandidateFromVote(choiceId: string) {
    const newVote: Candidate[] = [];

    let nextWriteInIndex = 0;
    for (const c of vote) {
      if (getCandidateChoiceId(c.id, c.partyIds) === choiceId) continue;

      if (!c.isWriteIn) {
        newVote.push(c);
        continue;
      }

      newVote.push({ ...c, writeInIndex: nextWriteInIndex });
      nextWriteInIndex += 1;
    }

    updateVote(contest.id, newVote);
    setRecentlyDeselectedCandidate(choiceId);
  }

  function handleUpdateSelection(choiceId: string) {
    /* istanbul ignore else - @preserve */
    if (choiceId) {
      // Parse choice ID to get candidate info
      const orderedCandidate = orderedCandidates.find(
        (c) => getCandidateChoiceId(c.id, c.partyIds) === choiceId
      );

      const candidateInVote = orderedCandidate
        ? findCandidateInVote(
            vote,
            orderedCandidate.id,
            orderedCandidate.partyIds
          )
        : findCandidateInVoteWithAnyParty(vote, choiceId);

      if (candidateInVote) {
        if (candidateInVote.isWriteIn) {
          setWriteInPendingRemoval(candidateInVote);
        } else {
          removeCandidateFromVote(choiceId);
        }
      } else {
        addCandidateToVote(choiceId);
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

  function confirmRemovePendingWriteInCandidate() {
    assert(writeInPendingRemoval);
    removeCandidateFromVote(writeInPendingRemoval.id);
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

    updateVote(contest.id, [
      ...vote,
      {
        id: `write-in-${camelCase(normalizedCandidateName)}`,
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
            {appStrings.labelNumVotesRemaining()}{' '}
            <NumberString
              value={contest.seats - uniqueCandidatesSelected}
              weight="bold"
            />
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
              const choiceId = getCandidateChoiceId(
                candidate.id,
                candidate.partyIds
              );
              const isChecked = !!findCandidateInVote(
                vote,
                candidate.id,
                candidate.partyIds
              );
              // In the case of a cross-endorsed candidate, we consider any
              // version of that candidate as equivalent in tabulation and the voter
              // may select multiple versions without it impacting the number of selections / overvote trigger.
              const isEquivalentToSelected = findCandidateInVoteWithAnyParty(
                vote,
                candidate.id
              );
              const isDisabled =
                hasReachedMaxSelections &&
                !isChecked &&
                !isEquivalentToSelected;

              function handleDisabledClick() {
                handleChangeVoteAlert(candidate);
              }
              let prefixAudioText: ReactNode = null;
              let suffixAudioText: ReactNode = null;

              // Recalculate unique candidates after this selection/deselection
              const numVotesRemaining =
                contest.seats - uniqueCandidatesSelected;
              if (isChecked) {
                prefixAudioText = appStrings.labelSelected();

                if (recentlySelectedCandidate === choiceId) {
                  suffixAudioText =
                    numVotesRemaining > 0 ? (
                      <React.Fragment>
                        {appStrings.labelNumVotesRemaining()}{' '}
                        <NumberString value={numVotesRemaining} weight="bold" />
                      </React.Fragment>
                    ) : (
                      appStrings.noteBmdContestCompleted()
                    );
                }
              } else if (recentlyDeselectedCandidate === choiceId) {
                prefixAudioText = appStrings.labelDeselected();

                suffixAudioText = (
                  <React.Fragment>
                    {appStrings.labelNumVotesRemaining()}{' '}
                    <NumberString value={numVotesRemaining} weight="bold" />
                  </React.Fragment>
                );
              }

              return (
                <ContestChoiceButton
                  key={choiceId}
                  isSelected={isChecked}
                  onPress={
                    isDisabled ? handleDisabledClick : handleUpdateSelection
                  }
                  choice={choiceId}
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
                    choice={candidate.id}
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
