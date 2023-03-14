import React from 'react';
import { createMockApiClient, MockApiClient } from '../../test/api';
import { renderInAppContext } from '../../test/render_in_app_context';
import { LoadElectionScreen } from './load_election_screen';

let mockApiClient: MockApiClient;

beforeEach(() => {
  mockApiClient = createMockApiClient();
});

afterEach(() => {
  mockApiClient.assertComplete();
});

test('shows a message that there is no election configuration', () => {
  const { getByText } = renderInAppContext(
    <LoadElectionScreen setElectionDefinition={jest.fn()} />,
    { apiClient: mockApiClient }
  );

  getByText('Load Election Configuration');
});
