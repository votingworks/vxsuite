import React from 'react';
import { screen } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ReviewPage } from './review_page';

const electionSample = electionSampleDefinition.election;

it('Renders ContestPage', () => {
  renderWithBallotContext(<Route path="/review" component={ReviewPage} />, {
    route: '/review',
    precinctId: electionSample.precincts[0].id,
    ballotStyleId: electionSample.ballotStyles[0].id,
  });
  screen.getByText('Review Your Votes');
  screen.getByText('Settings');
});

it('Renders ContestPage in Landscape orientation', () => {
  renderWithBallotContext(<Route path="/review" component={ReviewPage} />, {
    route: '/review',
    precinctId: electionSample.precincts[0].id,
    ballotStyleId: electionSample.ballotStyles[0].id,
    machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
  });
  screen.getByText('Review Your Votes');
});
