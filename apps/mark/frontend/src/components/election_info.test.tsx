import React from 'react';
import { singlePrecinctSelectionFor } from '@votingworks/utils';

import { electionSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '../../test/react_testing_library';
import { ElectionInfo } from './election_info';
import { ApiClientContext, createQueryClient } from '../api';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen({
  precinctSelection = singlePrecinctSelectionFor('23'),
  horizontal = true,
  ...rest
}: Partial<React.ComponentProps<typeof ElectionInfo>> = {}) {
  apiMock.expectGetElectionDefinition(electionDefinition);
  return render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <ElectionInfo
          precinctSelection={precinctSelection}
          horizontal={horizontal}
          {...rest}
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

test('renders horizontal ElectionInfo', async () => {
  const { container } = renderScreen();
  await screen.findByText(/Center Springfield/);
  expect(container).toMatchSnapshot();
});

test('renders with ballot style id', async () => {
  renderScreen({ ballotStyleId: '12' });
  await screen.findByText(/Center Springfield/);
  await screen.findByText('ballot style 12');
});

test('renders vertical ElectionInfo', async () => {
  const { container } = renderScreen({ horizontal: false });
  await screen.findByText(/Center Springfield/);
  expect(container).toMatchSnapshot();
});
