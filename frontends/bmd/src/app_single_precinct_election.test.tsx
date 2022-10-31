import React from 'react';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { makeElectionManagerCard } from '@votingworks/test-utils';
import { screen } from '@testing-library/react';
import { electionMinimalExhaustiveSampleSinglePrecinctDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { enterPin, render } from '../test/test_utils';
import { App } from './app';

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

jest.setTimeout(15000);

test('loading election with a single precinct automatically sets precinct', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider();

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );

  await screen.findByText('VxMark is Not Configured');

  // insert election manager card with different election
  card.insertCard(
    makeElectionManagerCard(
      electionMinimalExhaustiveSampleSinglePrecinctDefinition.electionHash
    ),
    electionMinimalExhaustiveSampleSinglePrecinctDefinition.electionData
  );
  await enterPin();
  userEvent.click(await screen.findByText('Load Election Definition'));
  await screen.findByText('10edbc8d2c');
  // Should not have All Precincts option available
  expect(screen.queryByLabelText('Precinct')).not.toBeInTheDocument();
  card.removeCard();
  await screen.findByText('Precinct 1');
});
