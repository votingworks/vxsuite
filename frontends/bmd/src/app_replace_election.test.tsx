import React from 'react';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { makeElectionManagerCard } from '@votingworks/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { electionSample2Definition } from '@votingworks/fixtures';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { authenticateAdminCard, render } from '../test/test_utils';
import { App } from './app';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

jest.setTimeout(15000);

test('replacing a loaded election with one from a card', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider();

  // setup with typical election
  await setElectionInStorage(storage);
  await setStateInStorage(storage);

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );

  // insert election manager card with different election
  card.insertCard(
    makeElectionManagerCard(electionSample2Definition.electionHash),
    electionSample2Definition.electionData
  );
  await authenticateAdminCard();
  await screen.findByText('Admin Card is not configured for this election');

  // unconfigure
  fireEvent.click(screen.getByText('Remove Current Election and All Data'));
  await advanceTimersAndPromises();

  // take out and put card in again to allow loading
  card.removeCard();
  await advanceTimersAndPromises();
  card.insertCard(
    makeElectionManagerCard(electionSample2Definition.electionHash),
    electionSample2Definition.electionData
  );
  await authenticateAdminCard();

  // load new election
  await screen.findByText('Election Admin Actions');
  fireEvent.click(screen.getByText('Load Election Definition'));
  await advanceTimersAndPromises();
  screen.getByText(electionSample2Definition.election.title);
});
