import React from 'react';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  createMockApiClient,
  MockApiClient,
  setAuthStatus,
} from '../../test/api';
import { renderInAppContext } from '../../test/render_in_app_context';
import { LoadElectionScreen } from './load_election_screen';

let mockApiClient: MockApiClient;

beforeEach(() => {
  mockApiClient = createMockApiClient();
  setAuthStatus(mockApiClient, {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionSampleDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  });
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
