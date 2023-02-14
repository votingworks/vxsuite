import React from 'react';
import { MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { screen } from '@testing-library/react';
import { electionMinimalExhaustiveSampleSinglePrecinctDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { getDisplayElectionHash } from '@votingworks/types';
import { ok } from '@votingworks/basics';
import { render } from '../test/test_utils';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(15000);

test('loading election with a single precinct automatically sets precinct', async () => {
  const electionDefinition =
    electionMinimalExhaustiveSampleSinglePrecinctDefinition;
  const { electionData } = electionDefinition;
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );

  await screen.findByText('VxMark is Not Configured');

  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: undefined })
    .resolves(ok(electionData));
  userEvent.click(await screen.findByText('Load Election Definition'));
  await screen.findByText(getDisplayElectionHash(electionDefinition));
  // Should not be able to select a precinct
  expect(screen.getByTestId('selectPrecinct')).toBeDisabled();
  screen.getByText(
    'Precinct can not be changed because there is only one precinct configured for this election.'
  );
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Precinct 1');
});
