/* eslint-disable no-console */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  electionSampleDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import {
  advanceTimersAndPromises,
  fakeKiosk,
  fakeUsbDrive,
  makeElectionManagerCard,
  makePollWorkerCard,
  makeVoterCard,
} from '@votingworks/test-utils';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';

import userEvent from '@testing-library/user-event';

import { ServerError } from '@votingworks/grout';
import { fakeLogger } from '@votingworks/logging';
import { deferred } from '@votingworks/basics';
import {
  authenticateElectionManagerCard,
  scannerStatus,
} from '../test/helpers/helpers';
import { createApiMock, statusNoPaper } from '../test/helpers/mock_api_client';
import { App, AppProps } from './app';

const apiMock = createApiMock();

function renderApp(props: Partial<AppProps> = {}) {
  const card = new MemoryCard();
  const hardware = MemoryHardware.build({
    connectPrinter: false,
    connectCardReader: true,
    connectPrecinctScanner: true,
  });
  const logger = fakeLogger();
  const storage = new MemoryStorage();
  render(
    <App
      card={card}
      hardware={hardware}
      logger={logger}
      apiClient={apiMock.mockApiClient}
      {...props}
    />
  );
  return { card, hardware, logger, storage };
}

beforeEach(() => {
  jest.useFakeTimers();
  apiMock.mockApiClient.reset();
  apiMock.expectGetMachineConfig();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('when backend does not respond shows error screen', async () => {
  const originalConsoleError = console.error;
  console.error = jest.fn();

  apiMock.mockApiClient.getConfig
    .expectCallWith()
    .throws(new ServerError('not responding'));
  apiMock.expectGetScannerStatus(statusNoPaper);

  renderApp();
  await screen.findByText('Something went wrong');
  expect(console.error).toHaveBeenCalled();

  console.error = originalConsoleError;
});

test('backend fails to unconfigure', async () => {
  const originalConsoleError = console.error;
  console.error = jest.fn();

  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus({ ...statusNoPaper, canUnconfigure: true });
  apiMock.mockApiClient.unconfigureElection
    .expectCallWith({})
    .throws(new ServerError('failed'));

  const { card } = renderApp();
  const electionManagerCard = makeElectionManagerCard(
    electionSampleDefinition.electionHash,
    '123456'
  );
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await authenticateElectionManagerCard();

  userEvent.click(
    await screen.findByText('Delete All Election Data from VxScan')
  );
  userEvent.click(await screen.findByText('Yes, Delete All'));

  await screen.findByText('Something went wrong');
  expect(console.error).toHaveBeenCalled();

  console.error = originalConsoleError;
});

test('Show invalid card screen when unsupported cards are given', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper, 2);

  const { card } = renderApp();
  await screen.findByText('Polls Closed');
  const voterCard = makeVoterCard(electionSampleDefinition.election);
  card.insertCard(voterCard);
  await screen.findByText('Invalid Card');

  // Remove card
  card.removeCard();
  await screen.findByText('Polls Closed');

  // Insert an invalid card
  card.insertCard(JSON.stringify({ t: 'something' }));
  await screen.findByText('Invalid Card');

  // Remove card
  card.removeCard();
  await screen.findByText('Polls Closed');

  // Insert a voter card which is invalid
  card.insertCard(JSON.stringify({ t: 'voter' }));
  await screen.findByText('Invalid Card');

  // Remove card
  card.removeCard();
  await screen.findByText('Polls Closed');

  // Insert a poll worker card which is invalid
  const pollWorkerCardWrongElection = makePollWorkerCard(
    electionWithMsEitherNeitherDefinition.electionHash
  );
  card.insertCard(pollWorkerCardWrongElection);
  await screen.findByText('Invalid Card');

  // Remove card
  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('show card backwards screen when card connection error occurs', async () => {
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);
  const { card } = renderApp();

  await screen.findByText('Polls Closed');
  card.insertCard(undefined, undefined, 'error');
  await screen.findByText('Card is Backwards');
  screen.getByText('Remove the card, turn it around, and insert it again.');

  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('shows internal wiring message when there is no plustek scanner, but tablet is plugged in', async () => {
  apiMock.expectGetConfig();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrecinctScannerConnected(false);
  hardware.setBatteryDischarging(false);
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'disconnected',
  });
  renderApp({ hardware });
  await screen.findByRole('heading', { name: 'Internal Connection Problem' });
  screen.getByText('Please ask a poll worker for help.');
});

test('shows power cable message when there is no plustek scanner and tablet is not plugged in', async () => {
  apiMock.expectGetConfig();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrecinctScannerConnected(false);
  hardware.setBatteryDischarging(true);
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'disconnected',
  });
  renderApp({ hardware });
  await screen.findByRole('heading', { name: 'No Power Detected' });
  screen.getByText('Please ask a poll worker to plug in the power cord.');

  apiMock.expectGetScannerStatus(statusNoPaper);
  act(() => hardware.setPrecinctScannerConnected(true));
  await screen.findByRole('heading', { name: 'Polls Closed' });
});

test('shows instructions to restart when the plustek crashed', async () => {
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrecinctScannerConnected(false);
  apiMock.expectGetScannerStatus({
    ...statusNoPaper,
    state: 'unrecoverable_error',
  });
  renderApp({ hardware });
  await screen.findByRole('heading', { name: 'Ballot Not Counted' });
  screen.getByText('Ask a poll worker to restart the scanner.');
});

test('App shows warning message to connect to power when disconnected', async () => {
  apiMock.expectGetConfig();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrinterConnected(false);
  hardware.setBatteryDischarging(true);
  hardware.setBatteryLevel(0.9);
  const kiosk = fakeKiosk();
  kiosk.getUsbDriveInfo = jest.fn().mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  apiMock.expectGetScannerStatus(statusNoPaper, 7);
  const { card } = renderApp({ hardware });
  apiMock.expectGetCastVoteRecordsForTally([]);
  await screen.findByText('Polls Closed');
  await screen.findByText('No Power Detected.');
  await screen.findByText(
    'Please ask a poll worker to plug in the power cord.'
  );
  // Plug in power and see that warning goes away
  act(() => {
    hardware.setBatteryDischarging(false);
  });

  await screen.findByText('Polls Closed');
  await advanceTimersAndPromises(3);
  expect(screen.queryByText('No Power Detected.')).toBeNull();

  // Open Polls
  const pollWorkerCard = makePollWorkerCard(
    electionSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');

  // Remove pollworker card
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');
  // There should be no warning about power
  expect(screen.queryByText('No Power Detected.')).toBeNull();
  // Disconnect from power and check for warning
  act(() => {
    hardware.setBatteryDischarging(true);
  });
  await screen.findByText('No Power Detected.');
});

test('removing card during calibration', async () => {
  apiMock.expectGetConfig();
  const kiosk = fakeKiosk();
  kiosk.getUsbDriveInfo = jest.fn().mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  apiMock.expectGetScannerStatus(statusNoPaper, 4);
  apiMock.expectGetCastVoteRecordsForTally([]);
  const { card } = renderApp();

  // Open Polls
  const pollWorkerCard = makePollWorkerCard(
    electionSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  userEvent.click(
    await screen.findByRole('button', { name: 'Yes, Open the Polls' })
  );
  apiMock.expectSetPollsState('polls_open');
  apiMock.expectGetConfig({ pollsState: 'polls_open' });
  await screen.findByText('Polls are open.');
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Start calibrating
  const electionManagerCard = makeElectionManagerCard(
    electionSampleDefinition.electionHash
  );
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await authenticateElectionManagerCard();

  const { promise, resolve } = deferred<boolean>();
  apiMock.mockApiClient.calibrate.expectCallWith().returns(promise);
  userEvent.click(
    await screen.findByRole('button', { name: 'Calibrate Scanner' })
  );
  await screen.findByText('Waiting for Paper');
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_scan' }));
  userEvent.click(await screen.findByRole('button', { name: 'Calibrate' }));
  await screen.findByText(/Calibrating/);

  apiMock.expectGetScannerStatus(scannerStatus({ state: 'calibrating' }));
  // Wait for status to update to calibrating (no way to tell on screen)
  await waitFor(() =>
    expect(() =>
      apiMock.mockApiClient.getScannerStatus.assertComplete()
    ).not.toThrow()
  );

  // Removing card shouldn't crash the app - for now we just show a blank screen
  card.removeCard();
  await waitFor(() => {
    expect(screen.queryByText(/Calibrating/)).not.toBeInTheDocument();
  });

  apiMock.expectGetScannerStatus(statusNoPaper);
  resolve(true);
  await screen.findByText('Insert Your Ballot Below');
});
