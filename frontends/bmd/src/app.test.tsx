import { fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeKiosk, makePollWorkerCard } from '@votingworks/test-utils';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/types';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import * as React from 'react';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { fakeTts } from '../test/helpers/fake_tts';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';
import { render } from '../test/test_utils';
import { App } from './app';
import { MarkAndPrint } from './config/types';
import { electionSampleDefinition } from './data';
import { AriaScreenReader } from './utils/ScreenReader';

beforeEach(() => {
  jest.useFakeTimers();
});

it('uses the card service and machine config service by default', async () => {
  fetchMock
    .get('/machine-config', {
      machineId: '0002',
      codeVersion: '3.14',
    })
    .get('/card/read', {
      body: {
        status: 'error',
      },
    });
  const hardware = MemoryHardware.buildStandard();

  render(<App hardware={hardware} />);

  await screen.findByText('Card is Backwards');
  expect(fetchMock.done()).toBe(true);
});

it('prevents context menus from appearing', async () => {
  render(
    <App
      card={new MemoryCard()}
      machineConfig={fakeMachineConfigProvider()}
      reload={jest.fn()}
    />
  );

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
  window.kiosk = kiosk;
  render(
    <App
      card={new MemoryCard()}
      machineConfig={fakeMachineConfigProvider()}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();
  expect(kiosk.storage.get).toHaveBeenCalled();
  delete window.kiosk;
});

it('changes screen reader settings based on keyboard inputs', async () => {
  const mockTts = fakeTts();
  const screenReader = new AriaScreenReader(mockTts);
  jest.spyOn(screenReader, 'toggle');
  jest.spyOn(screenReader, 'changeVolume');

  render(
    <App
      screenReader={screenReader}
      card={new MemoryCard()}
      machineConfig={fakeMachineConfigProvider()}
    />
  );

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
  jest.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    reload,
  });

  // Set up in an already-configured state.
  const electionDefinition = electionSampleDefinition;
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  const machineConfig = fakeMachineConfigProvider({
    appMode: MarkAndPrint,
  });

  await setElectionInStorage(storage, electionDefinition);
  await setStateInStorage(storage, {
    appPrecinct: ALL_PRECINCTS_SELECTION,
    isPollsOpen: false,
  });

  render(
    <App
      card={card}
      hardware={hardware}
      machineConfig={machineConfig}
      storage={storage}
    />
  );

  await advanceTimersAndPromises();

  // Force refresh
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText('Reset Accessible Controller'));
  expect(reload).toHaveBeenCalledTimes(1);
});
