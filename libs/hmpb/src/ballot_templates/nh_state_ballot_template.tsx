import { assert, ok } from '@votingworks/basics';
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
  if (props.election.type === 'general') {
    return General.BallotPageFrame(props);
  }
  assert(props.election.type === 'primary');
  return Primary.BallotPageFrame(props);
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
  if (props.election.type === 'general') {
    return General.BallotPageContent(props, scratchpad);
  }
  assert(props.election.type === 'primary');
  return Primary.BallotPageContent(props, scratchpad);
};

export const nhStateBallotTemplate: BallotPageTemplate<NhStateBallotProps> = {
  frameComponent: BallotPageFrame,
  contentComponent: BallotPageContent,
  stylesComponent: BaseStyles,
};
