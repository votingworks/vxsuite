import React from 'react';
import { Route } from 'react-router-dom';
import { electionSampleDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { QueryClientProvider } from '@tanstack/react-query';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ContestPage } from './contest_page';
import { Paths } from '../config/globals';
import { ApiClientContext, createQueryClient } from '../api';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

const electionSample = electionSampleDefinition.election;
const firstContestTitle = electionSample.contests[0].title;

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
        <Route path="/contests/:contestNumber" component={ContestPage} />
      </QueryClientProvider>
    </ApiClientContext.Provider>,
    props
  );
}

it('Renders ContestPage', async () => {
  const { container } = renderScreen({
    route: '/contests/0',
    precinctId: electionSample.precincts[0].id,
    ballotStyleId: electionSample.ballotStyles[0].id,
  });
  await screen.findByText(firstContestTitle);
  expect(container).toMatchSnapshot();
});

it('Renders ContestPage in Landscape orientation', async () => {
  const { container } = renderScreen({
    route: '/contests/0',
    precinctId: electionSample.precincts[0].id,
    ballotStyleId: electionSample.ballotStyles[0].id,
    machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
  });
  await screen.findByText(firstContestTitle);
  expect(container).toMatchSnapshot();
});

it('Renders ContestPage in Landscape orientation in Review Mode', async () => {
  window.location.hash = '#review';
  renderScreen({
    route: '/contests/0',
    precinctId: electionSample.precincts[0].id,
    ballotStyleId: electionSample.ballotStyles[0].id,
    machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
  });
  await screen.findByText(firstContestTitle);
  await screen.findByText('Review');
});

it('renders display settings button', () => {
  const history = createMemoryHistory({ initialEntries: ['/contests/0'] });

  renderScreen({
    history,
    route: '/contests/0',
    precinctId: electionSample.precincts[0].id,
    ballotStyleId: electionSample.ballotStyles[0].id,
  });

  expect(history.location.pathname).toEqual('/contests/0');

  userEvent.click(screen.getButton(/color.+size/i));
  expect(history.location.pathname).toEqual(Paths.DISPLAY_SETTINGS);
});
