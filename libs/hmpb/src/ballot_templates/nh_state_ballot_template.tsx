import { ok, throwIllegalValue } from '@votingworks/basics';
import type { Contest, OptionalCandidateOrderings } from '@votingworks/types';
import type {
  BallotPageTemplate,
  ContentComponent,
  FrameComponent,
} from '../render_common.js';
import * as General from './nh_state_general_ballot_template.js';
import * as Primary from './nh_state_primary_ballot_template.js';
import {
  BaseStyles,
  isFederalOfficeContest,
  type NhStateBallotProps,
  type NhStateBallotVariant,
} from './nh_state_ballot_components.js';
import * as defaults from './defaults.js';

const BallotPageFrame: FrameComponent<NhStateBallotProps> = (props) => {
  switch (props.election.type) {
    case 'general':
      return General.BallotPageFrame(props);
    case 'primary':
      return Primary.BallotPageFrame(props);
    default:
      throwIllegalValue(props.election.type);
  }
};

function contestsForBallot(
  candidateOrderings: OptionalCandidateOrderings,
  props: NhStateBallotProps
): readonly Contest[] {
  const contests = defaults.contestsForBallot(candidateOrderings, props);

  return props.variant === 'federalOfficeOnly'
    ? contests.filter(isFederalOfficeContest)
    : contests;
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
