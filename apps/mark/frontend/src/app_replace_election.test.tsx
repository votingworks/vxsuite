import React from 'react';
import { MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { fireEvent, screen } from '@testing-library/react';
import {
  electionSample2Definition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { render } from '../test/test_utils';
import { App } from './app';
import { advanceTimersAndPromises } from '../test/helpers/timers';
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

test('replacing a loaded election with one from a card', async () => {
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

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
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: electionSampleDefinition.electionHash })
    .resolves(ok(electionSample2Definition));
  apiMock.setAuthStatusElectionManagerLoggedIn(electionSample2Definition);
  await screen.findByText('This card is configured for a different election.');

  // unconfigure
  fireEvent.click(screen.getByText('Remove the Current Election and All Data'));
  await advanceTimersAndPromises();

  // load new election
  await screen.findByText('Election Manager Actions');
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: undefined })
    .resolves(ok(electionSample2Definition));
  userEvent.click(screen.getByText('Load Election Definition'));
  await advanceTimersAndPromises();
  screen.getByText(electionSample2Definition.election.title);
});
