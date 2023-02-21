import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryStorage, MemoryHardware } from '@votingworks/utils';
import { fakeLogger } from '@votingworks/logging';

import { electionSampleDefinition } from '@votingworks/fixtures';
import { ok } from '@votingworks/basics';

import { App } from './app';

import { withMarkup } from '../test/helpers/with_markup';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { voterContests } from '../test/helpers/election';
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

test('MarkAndPrint: voter settings in landscape orientation', async () => {
  const logger = fakeLogger();
  const electionDefinition = electionSampleDefinition;
  const { electionHash } = electionDefinition;
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig({
    screenOrientation: 'landscape',
  });
  const reload = jest.fn();
  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={reload}
      logger={logger}
    />
  );
  await advanceTimersAndPromises();
  const findByTextWithMarkup = withMarkup(screen.findByText);

  await advanceTimersAndPromises();

  // ---------------

  // Configure with Election Manager Card
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: undefined })
    .resolves(ok(electionDefinition));
  userEvent.click(await screen.findByText('Load Election Definition'));

  await advanceTimersAndPromises();
  screen.getByText('Election Definition is loaded.');
  userEvent.selectOptions(
    screen.getByLabelText('Precinct'),
    screen.getByText('Center Springfield')
  );
  userEvent.click(screen.getByText('Live Election Mode'));
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Open Polls with Poll Worker Card
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  userEvent.click(await screen.findByText('Open Polls'));
  userEvent.click(screen.getByText('Open Polls on VxMark Now'));
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('Insert Card');

  // ---------------

  // Complete Voter Happy Path

  // Start voter session
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ electionHash, ballotStyleId: '12', precinctId: '23' })
    .resolves();
  userEvent.click(await screen.findByText('12'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  await advanceTimersAndPromises();
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });

  screen.getByText(/Center Springfield/);
  screen.getByText(/(12)/);
  await findByTextWithMarkup('Your ballot has 20 contests.');

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
