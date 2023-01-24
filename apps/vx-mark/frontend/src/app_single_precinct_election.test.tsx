import React from 'react';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { makeElectionManagerCard } from '@votingworks/test-utils';
import { screen } from '@testing-library/react';
import { electionMinimalExhaustiveSampleSinglePrecinctDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { enterPin, render } from '../test/test_utils';
import { App } from './app';
import { createApiMock } from '../test/helpers/mock_api_client';

const apiMock = createApiMock();

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock.mockApiClient.reset();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(15000);

test('loading election with a single precinct automatically sets precinct', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
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
  // Should not be able to select a precinct
  expect(screen.getByTestId('selectPrecinct')).toBeDisabled();
  screen.getByText(
    'Precinct can not be changed because there is only one precinct configured for this election.'
  );
  card.removeCard();
  await screen.findByText('Precinct 1');
});
