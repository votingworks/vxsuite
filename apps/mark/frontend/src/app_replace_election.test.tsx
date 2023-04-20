import React from 'react';
import { MemoryHardware, MemoryStorage } from '@votingworks/utils';
import {
  electionSample2Definition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { FakeKiosk, fakeKiosk } from '@votingworks/test-utils';
import { fireEvent, screen } from '../test/react_testing_library';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
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

test('replacing a loaded election with one from USB', async () => {
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();
  // Set up an already-congfigured election
  apiMock.expectGetElectionDefinition(electionSampleDefinition);

  // setup with typical election
  await setElectionInStorage(storage);
  await setStateInStorage(storage);

  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );

  // insert election manager card with different election
  apiMock.setAuthStatusElectionManagerLoggedIn(electionSample2Definition);
  await screen.findByText('This card is configured for a different election.');

  // unconfigure
  apiMock.expectUnconfigureMachine();
  apiMock.expectGetElectionDefinition(null);
  fireEvent.click(screen.getByText('Remove the Current Election and All Data'));

  // load new election
  await screen.findByText('VxMark is not configured');
  await configureFromUsbThenRemove(
    apiMock,
    kiosk,
    screen,
    electionSample2Definition
  );
  await screen.findByText(electionSample2Definition.election.title);
});
