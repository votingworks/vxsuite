import { fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeKiosk } from '@votingworks/test-utils';
import {
  ALL_PRECINCTS_SELECTION,
  MemoryHardware,
  MemoryStorage,
} from '@votingworks/utils';

import fetchMock from 'fetch-mock';
import * as React from 'react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { fakeTts } from '../test/helpers/fake_tts';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';
import { render } from '../test/test_utils';
import { App } from './app';
import { AriaScreenReader } from './utils/ScreenReader';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

it('will throw an error when using default api', async () => {
  fetchMock.get('/api', {
    body: {
      machineId: '0002',
      codeVersion: '3.14',
    },
  });
  const hardware = MemoryHardware.buildStandard();
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  jest.spyOn(console, 'error').mockImplementation(() => {});

  render(<App hardware={hardware} />);

  await screen.findByText('Something went wrong');
});

it('Displays error boundary if the api returns an unexpected error', async () => {
  apiMock.expectGetMachineConfigToError();
  const storage = new MemoryStorage();
  const hardware = MemoryHardware.buildStandard();
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();
  screen.getByText('Something went wrong');
});

it('prevents context menus from appearing', async () => {
  apiMock.expectGetMachineConfig();
  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  const { oncontextmenu } = window;

  if (oncontextmenu) {
    const event = new MouseEvent('contextmenu');

    jest.spyOn(event, 'preventDefault');
    oncontextmenu.call(window, event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  }

  await advanceTimersAndPromises();
});

it('uses kiosk storage when in kiosk-browser', async () => {
  const kiosk = fakeKiosk();
  apiMock.expectGetMachineConfig();
  window.kiosk = kiosk;
  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);
  await advanceTimersAndPromises();
  expect(kiosk.storage.get).toHaveBeenCalled();
  delete window.kiosk;
});

it('changes screen reader settings based on keyboard inputs', async () => {
  const mockTts = fakeTts();
  apiMock.expectGetMachineConfig();
  const screenReader = new AriaScreenReader(mockTts);
  jest.spyOn(screenReader, 'toggle');
  jest.spyOn(screenReader, 'changeVolume');

  render(<App screenReader={screenReader} apiClient={apiMock.mockApiClient} />);

  await advanceTimersAndPromises();

  // check that 'r' toggles the screen reader
  expect(screenReader.toggle).toHaveBeenCalledTimes(0);
  fireEvent.keyDown(screen.getByRole('main'), { key: 'r' });
  await waitFor(() => {
    expect(screenReader.toggle).toHaveBeenCalledTimes(1);
  });

  // check that 'F17' changes volume
  expect(screenReader.changeVolume).toHaveBeenCalledTimes(0);
  fireEvent.keyDown(screen.getByRole('main'), { key: 'F17' });
  await waitFor(() => {
    expect(screenReader.changeVolume).toHaveBeenCalledTimes(1);
  });
});

// This test is only really here to provide coverage for the default value for
// `App`'s `reload` prop.
it('uses window.location.reload by default', async () => {
  // Stub location in a way that's good enough for this test, but not good
  // enough for general `window.location` use.
  const reload = jest.fn();
  apiMock.expectGetMachineConfig();
  jest.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    reload,
  });

  // Set up in an already-configured state.
  const electionDefinition = electionSampleDefinition;
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();

  await setElectionInStorage(storage, electionDefinition);
  await setStateInStorage(storage, {
    appPrecinct: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_closed_initial',
  });

  render(
    <App
      hardware={hardware}
      apiClient={apiMock.mockApiClient}
      storage={storage}
    />
  );

  await advanceTimersAndPromises();

  // Force refresh
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  userEvent.click(await screen.findByText('Reset Accessible Controller'));
  expect(reload).toHaveBeenCalledTimes(1);
});
