import { ok, throwIllegalValue } from '@votingworks/basics';
import React from 'react';
import {
  BallotPageTemplate,
  ContentComponent,
  FrameComponent,
} from '../render_ballot';
import * as General from './nh_state_general_ballot_template';
import * as Primary from './nh_state_primary_ballot_template';
import { BaseStyles, NhStateBallotProps } from './nh_state_ballot_components';

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
      throwIllegalValue(props.election.type);
  }
};

export type { NhStateBallotProps };

export const nhStateBallotTemplate: BallotPageTemplate<NhStateBallotProps> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
  stylesComponent: BaseStyles,
};
