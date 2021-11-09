import { fireEvent, screen } from '@testing-library/react';
import { fakeKiosk, makePollWorkerCard } from '@votingworks/test-utils';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';
import * as React from 'react';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';
import { render } from '../test/test_utils';
import { App } from './app';
import { PrecinctSelectionKind, VxMarkPlusVxPrint } from './config/types';
import { electionSampleDefinition } from './data';

beforeEach(() => {
  jest.useFakeTimers();
});

it('prevents context menus from appearing', async () => {
  render(
    <App machineConfig={fakeMachineConfigProvider()} reload={jest.fn()} />
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
    <App machineConfig={fakeMachineConfigProvider()} reload={jest.fn()} />
  );
  await advanceTimersAndPromises();
  expect(kiosk.storage.get).toHaveBeenCalled();
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
  const hardware = await MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  const machineConfig = fakeMachineConfigProvider({
    appMode: VxMarkPlusVxPrint,
  });

  await setElectionInStorage(storage, electionDefinition);
  await setStateInStorage(storage, {
    appPrecinct: { kind: PrecinctSelectionKind.AllPrecincts },
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
