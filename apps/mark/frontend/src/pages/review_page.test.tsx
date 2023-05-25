import React from 'react';
import { Route } from 'react-router-dom';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ReviewPage } from './review_page';
import { Paths } from '../config/globals';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiClientContext, createQueryClient } from '../api';

const electionSample = electionSampleDefinition.election;

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(
  props: Partial<Parameters<typeof renderWithBallotContext>[1]> = {}
) {
  apiMock.expectGetElectionDefinition(
    props.electionDefinition ?? electionSampleDefinition
  );
  return renderWithBallotContext(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <Route path="/review" component={ReviewPage} />
      </QueryClientProvider>
    </ApiClientContext.Provider>,
    props
  );
}

it('Renders ReviewPage', async () => {
  renderScreen({
    route: '/review',
    precinctId: electionSample.precincts[0].id,
    ballotStyleId: electionSample.ballotStyles[0].id,
  });
  await screen.findByText('Review Your Votes');
  await screen.findByText(/color.+size/i);
});

it('Renders ReviewPage in Landscape orientation', async () => {
  renderScreen({
    route: '/review',
    precinctId: electionSample.precincts[0].id,
    ballotStyleId: electionSample.ballotStyles[0].id,
    machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
  });
  await screen.findByText('Review Your Votes');
});

it('renders display settings button', async () => {
  const history = createMemoryHistory({ initialEntries: ['/review'] });

  renderScreen({
    ballotStyleId: electionSample.ballotStyles[0].id,
    history,
    precinctId: electionSample.precincts[0].id,
    route: '/review',
  });

  expect(history.location.pathname).toEqual('/review');

  userEvent.click(await screen.findButton(/color.+size/i));
  expect(history.location.pathname).toEqual(Paths.DISPLAY_SETTINGS);
});
