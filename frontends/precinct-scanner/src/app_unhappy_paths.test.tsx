import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  electionSampleDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import {
  advanceTimersAndPromises,
  fakeKiosk,
  fakeUsbDrive,
  makeAdminCard,
  makePollWorkerCard,
  makeVoterCard,
} from '@votingworks/test-utils';
import { Scan } from '@votingworks/api';
import fetchMock from 'fetch-mock';
import { MemoryCard, MemoryStorage, MemoryHardware } from '@votingworks/utils';
import { App } from './app';
import { MachineConfigResponse } from './config/types';

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

const getPrecinctConfigNoPrecinctResponseBody: Scan.GetCurrentPrecinctConfigResponse =
  {
    status: 'ok',
  };

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.reset();
});

test('when services/scan does not respond shows loading screen', async () => {
  fetchMock
    .get('/config/election', { status: 404 })
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/scanner/status', { status: 404 });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  render(<App card={card} hardware={hardware} />);
  await screen.findByText('Loading Configuration…');
});

test('services/scan fails to unconfigure', async () => {
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', {
      body: getPrecinctConfigNoPrecinctResponseBody,
    })
    .get('/scanner/status', statusNoPaper)
    .deleteOnce('/config/election', { status: 404 });

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  render(<App card={card} hardware={hardware} />);
  const adminCard = makeAdminCard(
    electionSampleDefinition.electionHash,
    '123456'
  );
  card.insertCard(adminCard, electionSampleDefinition.electionData);
  await advanceTimersAndPromises(1);
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('2'));
  fireEvent.click(screen.getByText('3'));
  fireEvent.click(screen.getByText('4'));
  fireEvent.click(screen.getByText('5'));
  fireEvent.click(screen.getByText('6'));
  await screen.findByText('Administrator Settings');

  fireEvent.click(await screen.findByText('Unconfigure Machine'));
  fireEvent.click(await screen.findByText('Unconfigure'));

  await screen.findByText('Loading');
});

test('Show invalid card screen when unsupported cards are given', async () => {
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', {
      body: getPrecinctConfigNoPrecinctResponseBody,
    })
    .deleteOnce('/config/election', { status: 404 })
    .get('/scanner/status', statusNoPaper);

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  render(<App card={card} hardware={hardware} />);
  await screen.findByText('Polls Closed');
  const voterCard = makeVoterCard(electionSampleDefinition.election);
  card.insertCard(voterCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Invalid Card, please remove.');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');

  // Insert an invalid card
  card.insertCard(JSON.stringify({ t: 'something' }));
  await advanceTimersAndPromises(2);
  await screen.findByText('Invalid Card, please remove.');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');

  // Insert a voter card which is invalid
  card.insertCard(JSON.stringify({ t: 'voter' }));
  await advanceTimersAndPromises(2);
  await screen.findByText('Invalid Card, please remove.');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');

  const pollWorkerCardWrongElection = makePollWorkerCard(
    electionWithMsEitherNeitherDefinition.electionHash
  );
  card.insertCard(pollWorkerCardWrongElection);
  await advanceTimersAndPromises(1);
  await screen.findByText('Invalid Card, please remove.');
});

test('show card backwards screen when card connection error occurs', async () => {
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', {
      body: getPrecinctConfigNoPrecinctResponseBody,
    })
    .deleteOnce('/config/election', { status: 404 })
    .get('/scanner/status', statusNoPaper);

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  render(<App card={card} hardware={hardware} />);
  await screen.findByText('Polls Closed');
  card.insertCard(undefined, undefined, 'error');
  await advanceTimersAndPromises(1);
  await screen.findByText('Card is Backwards');
  screen.getByText('Remove the card, turn it around, and insert it again.');

  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');
});

test('shows internal wiring message when there is no plustek scanner, but tablet is plugged in', async () => {
  const card = new MemoryCard();
  const storage = new MemoryStorage();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrecinctScannerConnected(false);
  hardware.setBatteryDischarging(false);
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { ...statusNoPaper, state: 'disconnected' });
  render(<App card={card} storage={storage} hardware={hardware} />);
  await screen.findByRole('heading', { name: 'Internal Connection Problem' });
  screen.getByText('Please tell the election clerk.');
});

test('shows power cable message when there is no plustek scanner and tablet is not plugged in', async () => {
  const card = new MemoryCard();
  const storage = new MemoryStorage();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrecinctScannerConnected(false);
  hardware.setBatteryDischarging(true);
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { ...statusNoPaper, state: 'disconnected' });
  render(<App card={card} storage={storage} hardware={hardware} />);
  await screen.findByRole('heading', { name: 'Power Cord Unplugged' });
  screen.getByText(
    'Please ask a poll worker to check that the power cord is plugged in.'
  );

  fetchMock.get(
    '/scanner/status',
    { body: statusNoPaper },
    { overwriteRoutes: true }
  );
  act(() => hardware.setPrecinctScannerConnected(true));
  await screen.findByRole('heading', { name: 'Polls Closed' });
  await advanceTimersAndPromises(1);
  await waitFor(() => expect(fetchMock.lastUrl()).toEqual('/scanner/status'));
  expect(fetchMock.done()).toBe(true);
});

test('App shows message to connect to power when disconnected and battery is low', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  hardware.setBatteryDischarging(true);
  hardware.setBatteryLevel(0.1);
  const storage = new MemoryStorage();
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { body: statusNoPaper });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('No Power Detected');
  await screen.findByText('and Battery is Low');
  await screen.findByText(
    'Please ask a poll worker to plug-in the power cord for this machine.'
  );
});

test('App shows warning message to connect to power when disconnected', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  hardware.setBatteryDischarging(true);
  hardware.setBatteryLevel(0.9);
  hardware.setPrinterConnected(false);
  const storage = new MemoryStorage();
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { body: statusNoPaper });
  render(<App card={card} hardware={hardware} storage={storage} />);
  fetchMock.post('/scan/export', {});
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');
  await screen.findByText('No Power Detected.');
  await screen.findByText(
    'Please ask a poll worker to plug in the power cord for this machine.'
  );
  // Plug in power and see that warning goes away
  act(() => {
    hardware.setBatteryDischarging(false);
  });
  await advanceTimersAndPromises(3);
  await screen.findByText('Polls Closed');
  expect(screen.queryByText('No Power Detected.')).toBeNull();

  // Open Polls
  const pollWorkerCard = makePollWorkerCard(
    electionSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  fireEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');

  // Remove pollworker card
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');
  // There should be no warning about power
  expect(screen.queryByText('No Power Detected.')).toBeNull();
  // Disconnect from power and check for warning
  act(() => {
    hardware.setBatteryDischarging(true);
  });
  await advanceTimersAndPromises(3);
  await screen.findByText('No Power Detected.');
});
