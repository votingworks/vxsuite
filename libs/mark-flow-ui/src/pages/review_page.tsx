/* istanbul ignore file - @preserve - tested via Mark/Mark-Scan */
import React from 'react';
import styled from 'styled-components';
import {
  Caption,
  electionStrings,
  Font,
  LinkButton,
  H1,
  WithScrollButtons,
  appStrings,
  AudioOnly,
  ReadOnLoad,
  PageNavigationButtonId,
  AssistiveTechInstructions,
} from '@votingworks/ui';

import { assert, assertDefined, find } from '@votingworks/basics';

import {
  BallotStyleId,
  ElectionDefinition,
  PartyId,
  PrecinctId,
  VotesDict,
  getBallotStyle,
} from '@votingworks/types';
import { Review, ReviewProps } from '../components/review';
import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';
import { VoterHelpScreenType, VoterScreen } from '../components/voter_screen';

const ContentHeader = styled(ReadOnLoad)`
  padding: 0.5rem 0.75rem 0;
`;

const PartyRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
`;

export interface ReviewPageProps {
  backUrl?: string;
  contests: ContestsWithMsEitherNeither;
  electionDefinition: ElectionDefinition;
  precinctId?: PrecinctId;
  ballotStyleId?: BallotStyleId;
  printScreenUrl: string;
  returnToContest?: ReviewProps['returnToContest'];
  votes: VotesDict;
  VoterHelpScreen?: VoterHelpScreenType;
  selectedPartyId?: PartyId;
  partySelectionScreenUrl?: string;
}

export function ReviewPage(props: ReviewPageProps): JSX.Element {
  const {
    backUrl,
    contests,
    electionDefinition,
    precinctId,
    ballotStyleId,
    printScreenUrl,
    returnToContest,
    votes,
    VoterHelpScreen,
    selectedPartyId,
    partySelectionScreenUrl,
  } = props;

  assert(
    typeof precinctId !== 'undefined',
    'precinctId is required to render ReviewPage'
  );
  assert(
    typeof ballotStyleId !== 'undefined',
    'ballotStyleId is required to render ReviewPage'
  );
  const { election } = electionDefinition;
  const ballotStyle = getBallotStyle({
    election,
    ballotStyleId,
  });
  assert(ballotStyle, `Ballot style with id ${ballotStyleId} not found`);

  const printMyBallotButton = (
    <LinkButton
      to={printScreenUrl}
      id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
      variant="primary"
      icon="Done"
    >
      {appStrings.buttonPrintBallot()}
      <AudioOnly>
        <AssistiveTechInstructions
          controllerString={appStrings.instructionsBmdConfirmPrintingBallot()}
          patDeviceString={appStrings.instructionsBmdConfirmPrintingBallotPatDevice()}
        />
      </AudioOnly>
    </LinkButton>
  );

  const backButton = backUrl ? (
    <LinkButton
      id={PageNavigationButtonId.PREVIOUS}
      icon="Previous"
      to={backUrl}
    >
      {appStrings.buttonBack()}
    </LinkButton>
  ) : undefined;

  return (
    <VoterScreen
      actionButtons={
        <React.Fragment>
          {backButton /* may be null */}
          {printMyBallotButton}
        </React.Fragment>
      }
      VoterHelpScreen={VoterHelpScreen}
    >
      <ContentHeader>
        <H1>{appStrings.titleBmdReviewScreen()}</H1>
        <AudioOnly>
          <AssistiveTechInstructions
            controllerString={appStrings.instructionsBmdReviewPageNavigation()}
            patDeviceString={appStrings.instructionsBmdReviewPageNavigationPatDevice()}
          />{' '}
          <AssistiveTechInstructions
            controllerString={appStrings.instructionsBmdReviewPageChangingVotes()}
            patDeviceString={appStrings.instructionsBmdReviewPageChangingVotesPatDevice()}
          />
        </AudioOnly>
      </ContentHeader>
      {partySelectionScreenUrl && (
        <PartyRow>
          <div>
            <Caption>{appStrings.labelParty()}</Caption>
            <div>
              <Font weight="bold">
                {electionStrings.partyFullName(
                  find(
                    election.parties,
                    (party) => party.id === assertDefined(selectedPartyId)
                  )
                )}
              </Font>
            </div>
          </div>
          <LinkButton icon="Edit" to={partySelectionScreenUrl}>
            {appStrings.buttonChangeParty()}
          </LinkButton>
        </PartyRow>
      )}
      <WithScrollButtons>
        <Review
          election={election}
          contests={contests}
          precinctId={precinctId}
          votes={votes}
          returnToContest={returnToContest}
          ballotStyle={ballotStyle}
        />
      </WithScrollButtons>
    </VoterScreen>
  );
}
