import React from 'react';
import { MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { electionMinimalExhaustiveSampleSinglePrecinctDefinition } from '@votingworks/fixtures';
import { getDisplayElectionHash } from '@votingworks/types';
import { FakeKiosk, fakeKiosk } from '@votingworks/test-utils';
import { screen } from '../test/react_testing_library';
import { render } from '../test/test_utils';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { configureFromUsbThenRemove } from '../test/helpers/ballot_package';

let apiMock: ApiMock;
let kiosk: FakeKiosk;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  kiosk = fakeKiosk();
  window.kiosk = kiosk;
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(15000);

test('loading election with a single precinct automatically sets precinct', async () => {
  const electionDefinition =
    electionMinimalExhaustiveSampleSinglePrecinctDefinition;
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings(null);
  apiMock.expectGetElectionDefinition(null);

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

  // Insert a USB with a ballot package
  await configureFromUsbThenRemove(apiMock, kiosk, screen, electionDefinition);
  await screen.findByText(getDisplayElectionHash(electionDefinition));
  // Should not be able to select a precinct
  expect(screen.getByTestId('selectPrecinct')).toBeDisabled();
  screen.getByText(
    'Precinct cannot be changed because there is only one precinct configured for this election.'
  );
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Precinct 1');
});
