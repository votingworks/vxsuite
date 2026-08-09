import { ok, throwIllegalValue } from '@votingworks/basics';
import React from 'react';
import {
  BallotPageTemplate,
  ContentComponent,
  FrameComponent,
} from '../render_ballot.js';
import * as General from './nh_state_general_ballot_template.js';
import * as Primary from './nh_state_primary_ballot_template.js';
import {
  BaseStyles,
  NhStateBallotProps,
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

const BallotPageContent: ContentComponent<NhStateBallotProps> = async (
  props,
  scratchpad
) => {
  if (!props) {
    return ok({
      currentPageElement: <React.Fragment />,
      nextPageProps: undefined,
    });
  }
  switch (props.election.type) {
    case 'general':
      return General.BallotPageContent(props, scratchpad);
    case 'primary':
      return Primary.BallotPageContent(props, scratchpad);
    default:
      /* istanbul ignore next */
      throwIllegalValue(props.election.type);
  }
};

export type { NhStateBallotProps };

export const nhStateBallotTemplate: BallotPageTemplate<NhStateBallotProps> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
  stylesComponent: BaseStyles,
};
