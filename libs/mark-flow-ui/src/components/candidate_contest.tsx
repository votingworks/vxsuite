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
  ReadOnLoad,
  AssistiveTechInstructions,
  PageNavigationButtonId,
  ScanPanelVirtualKeyboard,
  AccessibilityMode,
  Font,
  virtualKeyboardCommon,
} from '@votingworks/ui';
import { assert, assertDefined } from '@votingworks/basics';

import { UpdateVoteFunction } from '../config/types';

import { WRITE_IN_CANDIDATE_MAX_LENGTH } from '../config/globals';
import { ChoicesGrid } from './contest_screen_layout';
import { BreadcrumbMetadata, ContestHeader } from './contest_header';
import { WriteInCandidateName } from './write_in_candidate_name';

interface Props {
  breadcrumbs?: BreadcrumbMetadata;
  election: Election;
  contest: CandidateContestInterface;
  vote: CandidateVote;
  updateVote: UpdateVoteFunction;
  accessibilityMode?: AccessibilityMode;
  onOpenWriteInKeyboard?: () => void;
  onCloseWriteInKeyboard?: () => void;
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
  accessibilityMode,
  onOpenWriteInKeyboard,
  onCloseWriteInKeyboard,
}: Props): JSX.Element {
  const district = getContestDistrict(election, contest);

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

  function addCandidateToVote(id: string) {
    const { candidates } = contest;
    const candidate = findCandidateById(candidates, id);
    assert(candidate);
    updateVote(contest.id, [...vote, candidate]);
    setRecentlySelectedCandidate(id);
  }

  function removeCandidateFromVote(id: string) {
    const newVote: Candidate[] = [];

    let nextWriteInIndex = 0;
    for (const c of vote) {
      if (c.id === id) continue;

      if (!c.isWriteIn) {
        newVote.push(c);
        continue;
      }

      newVote.push({ ...c, writeInIndex: nextWriteInIndex });
      nextWriteInIndex += 1;
    }

    updateVote(contest.id, newVote);
    setRecentlyDeselectedCandidate(id);
  }

  function handleUpdateSelection(candidateId: string) {
    /* istanbul ignore else - @preserve */
    if (candidateId) {
      const candidate = findCandidateById(vote, candidateId);
      if (candidate) {
        if (candidate.isWriteIn) {
          setWriteInPendingRemoval(candidate);
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
        .slice(0, WRITE_IN_CANDIDATE_MAX_LENGTH)
    );
  }

  function onKeyboardBackspace() {
    setWriteInCandidateName((prevName) =>
      prevName.slice(0, Math.max(0, prevName.length - 1))
    );
  }

  const writeInCharsRemaining =
    WRITE_IN_CANDIDATE_MAX_LENGTH - writeInCandidateName.length;

  function keyDisabled(key: virtualKeyboardCommon.Key) {
    switch (key.action) {
      case virtualKeyboardCommon.ActionKey.ACCEPT:
        return writeInCandidateName.length === 0;

      case virtualKeyboardCommon.ActionKey.CANCEL:
        return false;

      case virtualKeyboardCommon.ActionKey.DELETE:
        return false;

      default:
        return writeInCharsRemaining === 0;
    }
  }

  function handleDisabledAddWriteInClick() {
    handleChangeVoteAlert({
      id: 'write-in',
      name: 'a write-in candidate',
    });
  }

  const hasReachedMaxSelections = contest.seats === vote.length;

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
          <Caption>
            {appStrings.labelNumVotesRemaining()}{' '}
            <NumberString value={contest.seats - vote.length} weight="bold" />
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
            {contest.candidates.map((candidate) => {
              const isChecked = !!findCandidateById(vote, candidate.id);
              const isDisabled = hasReachedMaxSelections && !isChecked;
              function handleDisabledClick() {
                handleChangeVoteAlert(candidate);
              }
              let prefixAudioText: ReactNode = null;
              let suffixAudioText: ReactNode = null;

              const numVotesRemaining = contest.seats - vote.length;
              if (isChecked) {
                prefixAudioText = appStrings.labelSelected();

                if (recentlySelectedCandidate === candidate.id) {
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
              } else if (recentlyDeselectedCandidate === candidate.id) {
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
                        {writeInCharsRemaining === 0 && (
                          <Icons.Warning color="warning" />
                        )}{' '}
                        {appStrings.labelCharactersRemaining()}{' '}
                        <NumberString value={writeInCharsRemaining} />
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
