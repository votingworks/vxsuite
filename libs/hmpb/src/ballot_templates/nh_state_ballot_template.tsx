import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { Contest, getBallotStyle, getContests } from '@votingworks/types';
import {
  BallotPageTemplate,
  ContentComponent,
  FrameComponent,
} from '../render_ballot';
import * as General from './nh_state_general_ballot_template';
import * as Primary from './nh_state_primary_ballot_template';
import {
  BaseStyles,
  isFederalOfficeContest,
  NhStateBallotProps,
} from './nh_state_ballot_components';

const BallotPageFrame: FrameComponent<NhStateBallotProps> = (props) => {
  switch (props.election.type) {
    case 'general':
      return General.BallotPageFrame(props);
    case 'primary':
      return Primary.BallotPageFrame(props);
    default:
      /* istanbul ignore next */
      throwIllegalValue(props.election.type);
  }
};

function contestsForBallot(props: NhStateBallotProps): readonly Contest[] {
  const { election, ballotStyleId } = props;
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  return getContests({ election, ballotStyle }).filter((contest) =>
    props.isFederalOfficeOnly ? isFederalOfficeContest(contest) : true
  );
}

const BallotPageContent: ContentComponent<NhStateBallotProps> = (
  props,
  contests,
  scratchpad
) => {
  switch (props.election.type) {
    case 'general':
      return General.BallotPageContent(props, contests, scratchpad);
    case 'primary':
      return Primary.BallotPageContent(props, contests, scratchpad);
    default:
      /* istanbul ignore next */
      throwIllegalValue(props.election.type);
  }
};

export type { NhStateBallotProps };

export const nhStateBallotTemplate: BallotPageTemplate<NhStateBallotProps> = {
  frameComponent: BallotPageFrame,
  contestsForBallot,
  contentComponent: BallotPageContent,
  stylesComponent: BaseStyles,
};
