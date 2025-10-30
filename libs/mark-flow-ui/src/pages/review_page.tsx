/* istanbul ignore file - @preserve - tested via Mark/Mark-Scan */
import styled from 'styled-components';
import {
  LinkButton,
  H1,
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
  PrecinctId,
  VotesDict,
  getBallotStyle,
} from '@votingworks/types';
import { Review, ReviewProps } from '../components/review';
import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';
import { VoterScreen } from '../components/voter_screen';

const ContentHeader = styled(ReadOnLoad)`
  padding: 0.5rem 0.75rem 0;
`;

export interface ReviewPageProps {
  contests: ContestsWithMsEitherNeither;
  electionDefinition?: ElectionDefinition;
  precinctId?: PrecinctId;
  ballotStyleId?: BallotStyleId;
  printScreenUrl: string;
  returnToContest?: ReviewProps['returnToContest'];
  votes: VotesDict;
}

export function ReviewPage(props: ReviewPageProps): JSX.Element {
  const {
    contests,
    electionDefinition,
    precinctId,
    ballotStyleId,
    printScreenUrl,
    returnToContest,
    votes,
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

  return (
    <VoterScreen actionButtons={printMyBallotButton}>
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
      <WithScrollButtons>
        <Review
          election={electionDefinition.election}
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
