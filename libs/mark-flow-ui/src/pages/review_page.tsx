/* istanbul ignore file - @preserve - tested via Mark/Mark-Scan */
import React from 'react';
import styled from 'styled-components';
import {
  Button,
  Caption,
  Icons,
  LinkButton,
  H1,
  H4,
  WithScrollButtons,
  appStrings,
  AudioOnly,
  ReadOnLoad,
  PageNavigationButtonId,
  AssistiveTechInstructions,
} from '@votingworks/ui';

import { assert } from '@votingworks/basics';

import {
  BallotStyleId,
  ElectionDefinition,
  isOpenPrimary,
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
  margin-bottom: 0.75rem;
`;

export interface ReviewPageProps {
  backUrl?: string;
  contests: ContestsWithMsEitherNeither;
  electionDefinition?: ElectionDefinition;
  headerContent?: React.ReactNode;
  selectedPartyId?: PartyId;
  onChangeParty?: () => void;
  precinctId?: PrecinctId;
  ballotStyleId?: BallotStyleId;
  printScreenUrl: string;
  returnToContest?: ReviewProps['returnToContest'];
  votes: VotesDict;
  VoterHelpScreen?: VoterHelpScreenType;
}

export function ReviewPage(props: ReviewPageProps): JSX.Element {
  const {
    backUrl,
    contests,
    electionDefinition,
    headerContent,
    selectedPartyId,
    onChangeParty,
    precinctId,
    ballotStyleId,
    printScreenUrl,
    returnToContest,
    votes,
    VoterHelpScreen,
  } = props;

  assert(
    electionDefinition,
    'electionDefinition is required to render ReviewPage'
  );
  assert(
    typeof precinctId !== 'undefined',
    'precinctId is required to render ReviewPage'
  );
  assert(
    typeof ballotStyleId !== 'undefined',
    'ballotStyleId is required to render ReviewPage'
  );
  const ballotStyle = getBallotStyle({
    election: electionDefinition.election,
    ballotStyleId,
  });
  assert(ballotStyle, `Ballot style with id ${ballotStyleId} not found`);

  const { election } = electionDefinition;
  const isOpenPrimaryElection = isOpenPrimary(election);
  const selectedPartyName =
    isOpenPrimaryElection &&
    selectedPartyId &&
    election.parties.find((p) => p.id === selectedPartyId)?.fullName;

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
        {headerContent}
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
      <WithScrollButtons>
        {isOpenPrimaryElection && onChangeParty && (
          <PartyRow>
            <div>
              <Caption>Party</Caption>
              <H4 style={{ margin: 0 }}>{selectedPartyName || 'None'}</H4>
            </div>
            <Button onPress={onChangeParty}>
              <Caption
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <Icons.Edit /> Change
              </Caption>
            </Button>
          </PartyRow>
        )}
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
