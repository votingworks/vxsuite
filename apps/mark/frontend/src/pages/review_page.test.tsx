import React from 'react';
import { Route } from 'react-router-dom';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ReviewPage } from './review_page';
import { Paths } from '../config/globals';

const electionSample = electionSampleDefinition.election;

it('Renders ReviewPage', () => {
  renderWithBallotContext(<Route path="/review" component={ReviewPage} />, {
    route: '/review',
    precinctId: electionSample.precincts[0].id,
    ballotStyleId: electionSample.ballotStyles[0].id,
  });
  screen.getByText('Review Your Votes');
  screen.getByText(/color & size/i);
});

it('Renders ReviewPage in Landscape orientation', () => {
  renderWithBallotContext(<Route path="/review" component={ReviewPage} />, {
    route: '/review',
    precinctId: electionSample.precincts[0].id,
    ballotStyleId: electionSample.ballotStyles[0].id,
    machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
  });
  screen.getByText('Review Your Votes');
});

it('renders display settings button', () => {
  const history = createMemoryHistory({ initialEntries: ['/review'] });

  renderWithBallotContext(<Route path="/review" component={ReviewPage} />, {
    ballotStyleId: electionSample.ballotStyles[0].id,
    history,
    precinctId: electionSample.precincts[0].id,
    route: '/review',
  });

  expect(history.location.pathname).toEqual('/review');

  userEvent.click(screen.getButton(/color & size/i));
  expect(history.location.pathname).toEqual(Paths.DISPLAY_SETTINGS);
});
