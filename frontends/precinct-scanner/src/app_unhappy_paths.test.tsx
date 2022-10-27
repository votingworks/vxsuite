import { act, screen, waitFor } from '@testing-library/react';
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
import { Scan } from '@votingworks/api';
import fetchMock from 'fetch-mock';
import { ALL_PRECINCTS_SELECTION, deferred } from '@votingworks/utils';

import userEvent from '@testing-library/user-event';

import { MachineConfigResponse } from './config/types';
import {
  authenticateElectionManagerCard,
  scannerStatus,
} from '../test/helpers/helpers';
import {
  mockPollsState,
  mockPollsStateChange,
} from '../test/helpers/mock_polls_state';
import { buildApp } from '../test/helpers/build_app';

const getMachineConfigBody: MachineConfigResponse = {
  machineId: '0002',
  codeVersion: '3.14',
};

const getTestModeConfigTrueResponseBody: Scan.GetTestModeConfigResponse = {
  status: 'ok',
  testMode: true,
};

const statusNoPaper: Scan.GetPrecinctScannerStatusResponse = {
  state: 'no_paper',
  canUnconfigure: true,
  ballotsCounted: 0,
};

const getPrecinctConfigAllPrecinctsResponseBody: Scan.GetPrecinctSelectionConfigResponse =
  {
    status: 'ok',
    precinctSelection: ALL_PRECINCTS_SELECTION,
  };

const getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
  {
    status: 'ok',
  };

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.reset();
  mockPollsState('polls_closed_initial');
});

test('when services/scan does not respond shows loading screen', async () => {
  fetchMock
    .get('/precinct-scanner/config/election', { status: 404 })
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/scanner/status', { status: 404 });

  buildApp().renderApp();
  await screen.findByText('Loading Configuration…');
});

test('services/scan fails to unconfigure', async () => {
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionSampleDefinition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigAllPrecinctsResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody,
    })
    .get('/precinct-scanner/scanner/status', statusNoPaper)
    .deleteOnce('/precinct-scanner/config/election', { status: 404 });

  const { renderApp, card } = buildApp();
  renderApp();
  const electionManagerCard = makeElectionManagerCard(
    electionSampleDefinition.electionHash,
    '123456'
  );
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await screen.findByText('Enter the card security code to unlock.');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));
  await screen.findByText('Election Manager Settings');

  userEvent.click(
    await screen.findByText('Delete All Election Data from VxScan')
  );
  userEvent.click(await screen.findByText('Yes, Delete All'));

  await screen.findByText('Loading');
});

test('Show invalid card screen when unsupported cards are given', async () => {
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionSampleDefinition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigAllPrecinctsResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody,
    })
    .deleteOnce('/precinct-scanner/config/election', { status: 404 })
    .get('/precinct-scanner/scanner/status', statusNoPaper);

  const { renderApp, card } = buildApp();
  renderApp();
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

  const pollWorkerCardWrongElection = makePollWorkerCard(
    electionWithMsEitherNeitherDefinition.electionHash
  );
  card.insertCard(pollWorkerCardWrongElection);
  await screen.findByText('Invalid Card');
});

test('show card backwards screen when card connection error occurs', async () => {
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionSampleDefinition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigAllPrecinctsResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody,
    })
    .deleteOnce('/precinct-scanner/config/election', { status: 404 })
    .get('/precinct-scanner/scanner/status', statusNoPaper);

  const { renderApp, card } = buildApp();
  renderApp();
  await screen.findByText('Polls Closed');
  card.insertCard(undefined, undefined, 'error');
  await screen.findByText('Card is Backwards');
  screen.getByText('Remove the card, turn it around, and insert it again.');

  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('shows internal wiring message when there is no plustek scanner, but tablet is plugged in', async () => {
  const { renderApp, hardware } = buildApp();
  hardware.setPrecinctScannerConnected(false);
  hardware.setBatteryDischarging(false);
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionSampleDefinition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigAllPrecinctsResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody,
    })
    .get('/precinct-scanner/scanner/status', {
      ...statusNoPaper,
      state: 'disconnected',
    });
  renderApp();
  await screen.findByRole('heading', { name: 'Internal Connection Problem' });
  screen.getByText('Please ask a poll worker for help.');
});

test('shows power cable message when there is no plustek scanner and tablet is not plugged in', async () => {
  const { renderApp, hardware } = buildApp();
  hardware.setPrecinctScannerConnected(false);
  hardware.setBatteryDischarging(true);
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionSampleDefinition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigAllPrecinctsResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody,
    })
    .get('/precinct-scanner/scanner/status', {
      ...statusNoPaper,
      state: 'disconnected',
    });
  renderApp();
  await screen.findByRole('heading', { name: 'No Power Detected' });
  screen.getByText('Please ask a poll worker to plug in the power cord.');

  fetchMock.get(
    '/precinct-scanner/scanner/status',
    { body: statusNoPaper },
    { overwriteRoutes: true }
  );
  act(() => hardware.setPrecinctScannerConnected(true));
  await screen.findByRole('heading', { name: 'Polls Closed' });
  await waitFor(() =>
    expect(fetchMock.lastUrl()).toEqual('/precinct-scanner/scanner/status')
  );
  expect(fetchMock.done()).toBe(true);
});

test('shows instructions to restart when the plustek crashed', async () => {
  mockPollsState('polls_open');
  const { renderApp, hardware } = buildApp();
  hardware.setPrecinctScannerConnected(false);
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionSampleDefinition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigAllPrecinctsResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody,
    })
    .get('/precinct-scanner/scanner/status', {
      ...statusNoPaper,
      state: 'unrecoverable_error',
    });
  renderApp();
  await screen.findByRole('heading', { name: 'Ballot Not Counted' });
  screen.getByText('Ask a poll worker to restart the scanner.');
  expect(fetchMock.done()).toBe(true);
});

test('App shows warning message to connect to power when disconnected', async () => {
  const { renderApp, hardware, card } = buildApp();
  hardware.setBatteryDischarging(true);
  hardware.setBatteryLevel(0.9);
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionSampleDefinition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigAllPrecinctsResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody,
    })
    .get('/precinct-scanner/scanner/status', { body: statusNoPaper });
  renderApp();
  fetchMock.post('/precinct-scanner/export', {});
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
  mockPollsStateChange('polls_open');
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
  const { renderApp, card } = buildApp();
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/precinct-scanner/config/election', {
      body: electionSampleDefinition,
    })
    .get('/precinct-scanner/config/testMode', {
      body: getTestModeConfigTrueResponseBody,
    })
    .get('/precinct-scanner/config/precinct', {
      body: getPrecinctConfigAllPrecinctsResponseBody,
    })
    .get('/precinct-scanner/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody,
    })
    .get('/precinct-scanner/scanner/status', { body: statusNoPaper })
    .post('/precinct-scanner/export', {});
  renderApp();

  // Open Polls
  const pollWorkerCard = makePollWorkerCard(
    electionSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  userEvent.click(
    await screen.findByRole('button', { name: 'Yes, Open the Polls' })
  );
  mockPollsStateChange('polls_open');
  await screen.findByText('Polls are open.');
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Start calibrating
  const electionManagerCard = makeElectionManagerCard(
    electionSampleDefinition.electionHash
  );
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await authenticateElectionManagerCard();

  const { promise, resolve } = deferred();
  fetchMock.post('/precinct-scanner/scanner/calibrate', promise);
  userEvent.click(
    await screen.findByRole('button', { name: 'Calibrate Scanner' })
  );
  await screen.findByText('Waiting for Paper');
  fetchMock.getOnce(
    '/precinct-scanner/scanner/status',
    { body: scannerStatus({ state: 'ready_to_scan' }) },
    { overwriteRoutes: true }
  );
  userEvent.click(await screen.findByRole('button', { name: 'Calibrate' }));
  expect(fetchMock.calls('/precinct-scanner/scanner/calibrate')).toHaveLength(
    1
  );
  await screen.findByText(/Calibrating/);

  fetchMock.get(
    '/precinct-scanner/scanner/status',
    { body: scannerStatus({ state: 'calibrating' }) },
    { overwriteRoutes: true }
  );
  // Wait for status to update to calibrating (no way to tell on screen)
  const statusCallCount = fetchMock.calls(
    '/precinct-scanner/scanner/status'
  ).length;
  await waitFor(() =>
    expect(
      fetchMock.calls('/precinct-scanner/scanner/status').length
    ).toBeGreaterThan(statusCallCount)
  );

  // Removing card shouldn't crash the app - for now we just show a blank screen
  card.removeCard();
  await waitFor(() => {
    expect(screen.queryByText(/Calibrating/)).not.toBeInTheDocument();
  });

  fetchMock.get(
    '/precinct-scanner/scanner/status',
    { body: statusNoPaper },
    { overwriteRoutes: true }
  );
  resolve({ body: { status: 'ok' } });
  await screen.findByText('Insert Your Ballot Below');

  expect(fetchMock.done()).toBe(true);
});
