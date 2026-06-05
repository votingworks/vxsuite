import { afterEach, beforeEach, test } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { anyPollingPlace } from '@votingworks/types';
import { render, screen } from '../test/react_testing_library';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { App } from './app';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

const fixtures = electionFamousNames2021Fixtures;
const electionDefinition = fixtures.readElectionDefinition();
const pollingPlace = anyPollingPlace(electionDefinition.election);

test('machineConfig is fetched from api client by default', async () => {
  apiMock.expectGetMachineConfig({
    codeVersion: 'mock-code-version',
  });
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId: pollingPlace.id,
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('mock-code-version');
});
