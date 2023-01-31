import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  makeElectionManagerCard,
  makeVoterCard,
  makePollWorkerCard,
} from '@votingworks/test-utils';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';
import { fakeLogger } from '@votingworks/logging';

import { MarkAndPrint } from '@votingworks/types';
import { electionSampleDefinition } from '@votingworks/fixtures';

import { App } from './app';

import { withMarkup } from '../test/helpers/with_markup';

import { advanceTimersAndPromises } from '../test/helpers/smartcards';

import { voterContests } from '../test/helpers/election';
import { enterPin } from '../test/test_utils';
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

test('MarkAndPrint: voter settings in landscape orientation', async () => {
  const logger = fakeLogger();
  const electionDefinition = electionSampleDefinition;
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig({
    appMode: MarkAndPrint,
    screenOrientation: 'landscape',
  });
  const reload = jest.fn();
  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={reload}
      logger={logger}
    />
  );
  await advanceTimersAndPromises();
  const electionManagerCard = makeElectionManagerCard(
    electionDefinition.electionHash
  );
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  const getByTextWithMarkup = withMarkup(screen.getByText);

  card.removeCard();
  await advanceTimersAndPromises();

  // ---------------

  // Configure with Election Manager Card
  card.insertCard(electionManagerCard, electionDefinition.electionData);
  await enterPin();
  userEvent.click(screen.getByText('Load Election Definition'));

  await advanceTimersAndPromises();
  screen.getByText('Election Definition is loaded.');
  userEvent.selectOptions(
    screen.getByLabelText('Precinct'),
    screen.getByText('Center Springfield')
  );
  userEvent.click(screen.getByText('Live Election Mode'));
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Open Polls with Poll Worker Card
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  userEvent.click(screen.getByText('Open Polls'));
  userEvent.click(screen.getByText('Open Polls on VxMark Now'));
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // ---------------

  // Complete Voter Happy Path

  // Insert Voter card
  card.insertCard(makeVoterCard(electionDefinition.election));
  await advanceTimersAndPromises();
  screen.getByText(/Center Springfield/);
  screen.getByText(/(12)/);
  getByTextWithMarkup('Your ballot has 20 contests.');

  // Adjust Text Size on Start Page
  expect(
    screen.getAllByLabelText('Text Size:', { exact: false }).length
  ).toEqual(3);
  userEvent.click(screen.getByLabelText('Text Size: Small'));
  expect(window.document.documentElement.style.fontSize).toEqual('22px');

  // Start Voting
  userEvent.click(screen.getByText('Start Voting'));
  await advanceTimersAndPromises();

  // Adjust Text Size in Settings Modal on Contest Screen
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('Voter Settings');
  userEvent.click(screen.getByLabelText('Text Size: Large'));
  expect(window.document.documentElement.style.fontSize).toEqual('36px');
  userEvent.click(screen.getByText('Done'));

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i += 1) {
    await advanceTimersAndPromises();
    userEvent.click(screen.getByText('Next'));
  }

  // Review Screen
  await advanceTimersAndPromises();
  screen.getByText('Review Your Votes');

  // Review Screen has Voter Settings
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('Voter Settings');
  userEvent.click(screen.getByText('Done'));
});
