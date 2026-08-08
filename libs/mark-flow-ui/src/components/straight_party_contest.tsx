import React, { ReactNode, useEffect, useState } from 'react';
import {
  Election,
  getContestDistrict,
  PartyId,
  StraightPartyContest as StraightPartyContestInterface,
  StraightPartyVote,
} from '@votingworks/types';
import {
  Main,
  WithScrollButtons,
  Caption,
  appStrings,
  NumberString,
  AudioOnly,
  AssistiveTechInstructions,
  ContestChoiceButton,
  electionStrings,
  Modal,
  P,
  Button,
  PageNavigationButtonId,
} from '@votingworks/ui';
import { find } from '@votingworks/basics';
import { UpdateVoteFunction } from '../config/types.js';
import { ContestHeader } from './contest_header.js';
import { ChoicesGrid } from './contest_screen_layout.js';

interface Props {
  election: Election;
  contest: StraightPartyContestInterface;
  vote?: StraightPartyVote;
  updateVote: UpdateVoteFunction;
  isReviewMode?: boolean;
}

export function StraightPartyContest({
  election,
  contest,
  vote = [],
  updateVote,
  isReviewMode,
}: Props): JSX.Element {
  const district = getContestDistrict(election, contest);
  const votesRemaining = 1 - vote.length;
  const [showOvervoteWarning, setShowOvervoteWarning] = useState(false);
  const [recentlyDeselectedOption, setRecentlyDeselectedOption] =
    useState<PartyId>();

  useEffect(() => {
    if (recentlyDeselectedOption) {
      const timer = setTimeout(
        () => setRecentlyDeselectedOption(undefined),
        100
      );
      return () => clearTimeout(timer);
    }
  }, [recentlyDeselectedOption]);

  function handleOptionPress(optionId: PartyId) {
    if (vote.includes(optionId)) {
      updateVote(contest.id, []);
      setRecentlyDeselectedOption(optionId);
    } else if (vote.length > 0) {
      setShowOvervoteWarning(true);
    } else {
      updateVote(contest.id, [optionId]);
    }
  }

  return (
    <Main flexColumn>
      <ContestHeader contest={contest} district={district}>
        <Caption>
          {appStrings.labelNumVotesRemaining()}{' '}
          <NumberString value={votesRemaining} weight="bold" />
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
      </ContestHeader>
      <WithScrollButtons>
        <ChoicesGrid>
          {contest.optionIds.map((partyId) => {
            const isSelected = vote.includes(partyId);
            let prefixAudioText: ReactNode = null;
            let suffixAudioText: ReactNode = null;
            if (isSelected) {
              prefixAudioText = appStrings.labelSelectedOption();
              suffixAudioText = appStrings.noteBmdContestCompleted();
            } else if (recentlyDeselectedOption === partyId) {
              prefixAudioText = appStrings.labelDeselectedOption();
            }
            return (
              <ContestChoiceButton
                key={partyId}
                isSelected={isSelected}
                label={
                  <React.Fragment>
                    <AudioOnly>{prefixAudioText}</AudioOnly>
                    {electionStrings.partyFullName(
                      find(election.parties, (party) => party.id === partyId)
                    )}
                    <AudioOnly>{suffixAudioText}</AudioOnly>
                  </React.Fragment>
                }
                choice={partyId}
                onPress={handleOptionPress}
              />
            );
          })}
        </ChoicesGrid>
      </WithScrollButtons>
      {showOvervoteWarning && (
        <Modal
          centerContent
          content={
            <P>
              {appStrings.warningOvervoteYesNoContest()}
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
              onPress={() => setShowOvervoteWarning(false)}
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
    </Main>
  );
}
