import {
  electionSample,
  electionSampleNoSealDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { getBallotStyle, getContests, vote } from '@votingworks/types';
import React from 'react';
import { Route } from 'react-router-dom';
import { expectPrintToMatchSnapshot } from '@votingworks/test-utils';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '../../test/test_utils';
import { PrintPage } from './print_page';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiClientContext, createQueryClient } from '../api';

jest.mock(
  '@votingworks/ballot-encoder',
  (): typeof import('@votingworks/ballot-encoder') => {
    return {
      ...jest.requireActual('@votingworks/ballot-encoder'),
      // mock encoded ballot so BMD ballot QR code does not change with every change to election definition
      encodeBallot: () => new Uint8Array(),
    };
  }
);

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(renderOptions: Parameters<typeof render>[1] = {}) {
  apiMock.expectGetElectionDefinition(
    renderOptions.electionDefinition ?? electionSampleDefinition
  );
  return render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <Route path="/print" component={PrintPage} />
      </QueryClientProvider>
    </ApiClientContext.Provider>,
    renderOptions
  );
}

it('prints correct ballot without votes', async () => {
  renderScreen({
    ballotStyleId: '5',
    generateBallotId: () => 'CHhgYxfN5GeqnK8KaVOt1w',
    precinctId: '21',
    route: '/print',
  });
  await expectPrintToMatchSnapshot();
});

it('prints correct ballot with votes', async () => {
  renderScreen({
    ballotStyleId: '5',
    generateBallotId: () => 'CHhgYxfN5GeqnK8KaVOt1w',
    precinctId: '21',
    route: '/print',
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election: electionSample,
          ballotStyleId: '5',
        })!,
        election: electionSample,
      }),
      {
        president: 'barchi-hallaren',
        'question-a': ['no'],
        'question-b': ['yes'],
        'lieutenant-governor': 'norberg',
      }
    ),
  });
  await expectPrintToMatchSnapshot();
});

it('prints correct ballot without votes and inline seal', async () => {
  const electionDefinition = electionSampleDefinition;
  renderScreen({
    ballotStyleId: '5',
    electionDefinition,
    generateBallotId: () => 'CHhgYxfN5GeqnK8KaVOt1w',
    precinctId: '21',
    route: '/print',
  });
  await expectPrintToMatchSnapshot();
});

it('prints correct ballot without votes and no seal', async () => {
  const electionDefinition = electionSampleNoSealDefinition;
  renderScreen({
    ballotStyleId: '5',
    electionDefinition,
    generateBallotId: () => 'CHhgYxfN5GeqnK8KaVOt1w',
    precinctId: '21',
    route: '/print',
  });
  await expectPrintToMatchSnapshot();
});
