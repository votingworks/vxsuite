import { useState } from 'react';
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
import { UpdateVoteFunction } from '../config/types';
import { ContestHeader } from './contest_header';
import { ChoicesGrid } from './contest_screen_layout';

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

  function handleOptionPress(optionId: PartyId) {
    if (vote.includes(optionId)) {
      updateVote(contest.id, []);
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
          {contest.optionIds.map((partyId) => (
            <ContestChoiceButton
              key={partyId}
              isSelected={vote.includes(partyId)}
              label={electionStrings.partyFullName(
                find(election.parties, (party) => party.id === partyId)
              )}
              choice={partyId}
              onPress={handleOptionPress}
            />
          ))}
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
