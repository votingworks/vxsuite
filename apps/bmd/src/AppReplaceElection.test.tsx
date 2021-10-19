import React from 'react';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { makeAdminCard } from '@votingworks/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { electionSample2Definition } from '@votingworks/fixtures';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig';
import { render } from '../test/testUtils';
import App from './App';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';

beforeEach(() => {
  window.location.href = '/';
});

jest.useFakeTimers();
jest.setTimeout(15000);

test('replacing a loaded election with one from a card', async () => {
  const card = new MemoryCard();
  const hardware = await MemoryHardware.buildStandard();
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
    />
  );

  // insert admin card with different election
  card.insertCard(
    makeAdminCard(electionSample2Definition.electionHash),
    electionSample2Definition.electionData
  );
  await advanceTimersAndPromises();
  await waitFor(() =>
    screen.getByText('Admin Card is not configured for this election')
  );

  // unconfigure
  fireEvent.click(screen.getByText('Remove Current Election and All Data'));
  await advanceTimersAndPromises();

  // take out and put card in again to allow loading
  card.removeCard();
  await advanceTimersAndPromises();
  card.insertCard(
    makeAdminCard(electionSample2Definition.electionHash),
    electionSample2Definition.electionData
  );
  await advanceTimersAndPromises();

  // load new election
  await waitFor(() => screen.getByText('Election Admin Actions'));
  fireEvent.click(screen.getByText('Load Election Definition'));
  await advanceTimersAndPromises();
  screen.getByText(electionSample2Definition.election.title);
});
