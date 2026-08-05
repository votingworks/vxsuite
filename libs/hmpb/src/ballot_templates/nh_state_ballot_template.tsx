import { assertDefined, ok, throwIllegalValue } from '@votingworks/basics';
import { Contest, getBallotStyle, getContests } from '@votingworks/types';
import {
  BallotPageTemplate,
  ContentComponent,
  FrameComponent,
} from '../render_ballot.js';
import * as General from './nh_state_general_ballot_template.js';
import * as Primary from './nh_state_primary_ballot_template.js';
import {
  BaseStyles,
  isFederalOfficeContest,
  NhStateBallotProps,
  NhStateBallotVariant,
} from './nh_state_ballot_components.js';

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
    props.variant === 'federalOfficeOnly'
      ? isFederalOfficeContest(contest)
      : true
  );
}

const BallotPageContent: ContentComponent<NhStateBallotProps> = async (
  props,
  contests,
  scratchpad
) => {
  // Federal-office-only and UOCAVA ballots should not include blank placeholder pages
  if (contests.length === 0 && props.variant) {
    return ok(undefined);
  }
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

export type { NhStateBallotProps, NhStateBallotVariant };

export const nhStateBallotTemplate: BallotPageTemplate<NhStateBallotProps> = {
  frameComponent: BallotPageFrame,
  contestsForBallot,
  contentComponent: BallotPageContent,
  stylesComponent: BaseStyles,
};
