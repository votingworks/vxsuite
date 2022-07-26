import React from 'react';
import fetchMock from 'fetch-mock';
import { promises as fs } from 'fs';
import { Scan } from '@votingworks/api';
import {
  TallySourceMachineType,
  MemoryCard,
  MemoryHardware,
  MemoryStorage,
  typedAs,
  readBallotPackageFromFilePointer,
} from '@votingworks/utils';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import {
  render,
  waitFor,
  fireEvent,
  screen,
  act,
} from '@testing-library/react';
import {
  fakeKiosk,
  fakeUsbDrive,
  advanceTimersAndPromises,
  makePollWorkerCard,
  makeAdminCard,
  makeSuperadminCard,
  getZeroCompressedTally,
} from '@votingworks/test-utils';
import { join } from 'path';
import { electionSampleDefinition } from '@votingworks/fixtures';

import { AdjudicationReason, PrecinctSelectionKind } from '@votingworks/types';

import { mocked } from 'ts-jest/utils';
import { CARD_POLLING_INTERVAL } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { App } from './app';

import { stateStorageKey } from './app_root';
import {
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  TIME_TO_DISMISS_SUCCESS_SCREEN_MS,
} from './config/globals';
import { MachineConfigResponse } from './config/types';

jest.setTimeout(20000);

fetchMock.config.overwriteRoutes = false;

// Mock just `readBallotPackageFromFilePointer` from `@votingworks/utils`.
const readBallotPackageFromFilePointerMock = mocked(
  readBallotPackageFromFilePointer
);
const { readBallotPackageFromFile } = jest.requireActual('@votingworks/utils');

jest.mock('@votingworks/utils/build/ballot_package', () => ({
  ...jest.requireActual('@votingworks/utils/build/ballot_package'),
  readBallotPackageFromFilePointer: jest.fn(),
}));
// End mocking `readBallotPackageFromFilePointer`.

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.reset();
});

const getMachineConfigBody: MachineConfigResponse = {
  machineId: '0002',
  codeVersion: '3.14',
};

const getTestModeConfigTrueResponseBody: Scan.GetTestModeConfigResponse = {
  status: 'ok',
  testMode: true,
};

function scannerStatus(
  props: Partial<Scan.GetPrecinctScannerStatusResponse> = {}
) {
  return {
    state: 'no_paper',
    ballotsCounted: 0,
    canUnconfigure: false,
    ...props,
  };
}

const statusNoPaper = scannerStatus({ state: 'no_paper' });
const statusReadyToScan = scannerStatus({ state: 'ready_to_scan' });

const getPrecinctConfigNoPrecinctResponseBody: Scan.GetCurrentPrecinctConfigResponse =
  {
    status: 'ok',
  };

async function authenticateAdminCard() {
  jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
  await screen.findByText('Enter the card security code to unlock.');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('2'));
  fireEvent.click(screen.getByText('3'));
  fireEvent.click(screen.getByText('4'));
  fireEvent.click(screen.getByText('5'));
  fireEvent.click(screen.getByText('6'));
  screen.getByText('Administrator Settings');
}

test('shows setup card reader screen when there is no card reader', async () => {
  const card = new MemoryCard();
  const storage = new MemoryStorage();
  const hardware = MemoryHardware.buildStandard();
  hardware.setCardReaderConnected(false);
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { body: statusNoPaper });
  render(<App storage={storage} hardware={hardware} card={card} />);
  await screen.findByText('Card Reader Not Detected');
});

test('initializes app with stored state', async () => {
  const logger = fakeLogger();
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: true });
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { body: statusNoPaper })
    .patchOnce('/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(
    <App card={card} hardware={hardware} storage={storage} logger={logger} />
  );
  await advanceTimersAndPromises(1);
  await screen.findByText('No USB Drive Detected');
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  await advanceTimersAndPromises(1);

  // Insert a pollworker card
  fetchMock.post('/scan/export', {});
  const pollWorkerCard = makePollWorkerCard(
    electionSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to close the polls?');
});

test('app can load and configure from a usb stick', async () => {
  const storage = new MemoryStorage();
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .getOnce('/config/election', new Response('null'))
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { body: statusNoPaper });
  render(<App storage={storage} card={card} hardware={hardware} />);
  await screen.findByText('Loading Configuration…');
  await advanceTimersAndPromises(1);
  await screen.findByText('VxScan is Not Configured');
  await screen.findByText('Insert USB Drive with configuration.');

  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  await advanceTimersAndPromises(2);

  await screen.findByText(
    'Error in configuration: No ballot package found on the inserted USB drive.'
  );

  // Remove the USB
  kiosk.getUsbDrives.mockResolvedValue([]);
  await advanceTimersAndPromises(2);
  await screen.findByText('Insert USB Drive with configuration.');

  // Mock getFileSystemEntries returning an error
  kiosk.getFileSystemEntries.mockRejectedValueOnce('error');
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  await advanceTimersAndPromises(2);
  await screen.findByText(
    'Error in configuration: No ballot package found on the inserted USB drive.'
  );

  // Remove the USB
  kiosk.getUsbDrives.mockResolvedValue([]);
  await advanceTimersAndPromises(2);
  await screen.findByText('Insert USB Drive with configuration.');

  const pathToFile = join(
    __dirname,
    '../test/fixtures/ballot-package-state-of-hamilton.zip'
  );
  kiosk.getFileSystemEntries.mockResolvedValue([
    {
      name: 'ballot-package-old.zip',
      path: pathToFile,
      type: 1,
      size: 1,
      atime: new Date(),
      ctime: new Date(2021, 0, 1),
      mtime: new Date(),
    },
    {
      name: 'ballot-package-new.zip',
      path: pathToFile,
      type: 1,
      size: 1,
      atime: new Date(),
      ctime: new Date(2021, 10, 9),
      mtime: new Date(),
    },
  ]);
  const fileContent = await fs.readFile(pathToFile);
  kiosk.readFile.mockResolvedValue(fileContent as unknown as string);
  const ballotPackage = await readBallotPackageFromFile(
    new File([fileContent], 'ballot-package-new.zip')
  );
  /* This function can take too long when the test is running for the results to be seen in time for the
   * test to pass consistently. By running it above and mocking out the result we guarantee the test will
   * pass consistently.
   */
  readBallotPackageFromFilePointerMock.mockResolvedValue(ballotPackage);

  fetchMock
    .patchOnce('/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    })
    .patchOnce('/config/election', {
      body: typedAs<Scan.PatchElectionConfigResponse>({ status: 'ok' }),
      status: 200,
    })
    .post('/scan/hmpb/addTemplates', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .post('/scan/hmpb/doneTemplates', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .get('/config/election', electionSampleDefinition, {
      overwriteRoutes: true,
    });

  // Reinsert USB now that fake zip file on it is setup
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  await advanceTimersAndPromises(2);
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');
  expect(kiosk.getFileSystemEntries).toHaveBeenCalledWith(
    'fake mount point/ballot-packages'
  );
  expect(fetchMock.calls('/config/election', { method: 'PATCH' })).toHaveLength(
    1
  );
  expect(fetchMock.calls('/scan/hmpb/addTemplates')).toHaveLength(16);
  expect(fetchMock.calls('/scan/hmpb/doneTemplates')).toHaveLength(1);

  expect(readBallotPackageFromFilePointerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'ballot-package-new.zip',
    })
  );
});

test('admin and pollworker configuration', async () => {
  const logger = fakeLogger();
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: false });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { body: statusNoPaper })
    .patchOnce('/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(
    <App card={card} hardware={hardware} storage={storage} logger={logger} />
  );
  await advanceTimersAndPromises(1);
  await screen.findByText('No USB Drive Detected');
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');

  // Insert a pollworker card
  fetchMock.post('/scan/export', {});
  const pollWorkerCard = makePollWorkerCard(
    electionSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to open the polls?');

  // Basic auth logging check
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogin,
    'pollworker',
    expect.objectContaining({ disposition: 'success' })
  );

  // Open Polls
  act(() => {
    hardware.setPrinterConnected(false);
  });
  fireEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 0,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: { kind: PrecinctSelectionKind.AllPrecincts },
      tally: getZeroCompressedTally(electionSampleDefinition.election),
    })
  );
  expect(fetchMock.calls('/scan/export')).toHaveLength(1);

  // Remove poll worker card to see Insert Ballot Screen
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');
  await screen.findByText('Scan one ballot sheet at a time.');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  // Insert admin card to set precinct
  const adminCard = makeAdminCard(
    electionSampleDefinition.electionHash,
    '123456'
  );
  card.insertCard(adminCard, electionSampleDefinition.electionData);
  await authenticateAdminCard();
  fireEvent.click(await screen.findByText('Live Election Mode'));
  await screen.findByText('Loading');
  await advanceTimersAndPromises(1);
  expect(fetchMock.calls('/config/testMode', { method: 'PATCH' })).toHaveLength(
    1
  );
  fetchMock.putOnce('/config/precinct', { body: { status: 'ok' } });

  // Remove Card and check polls were reset to closed.
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');

  // Open Polls again
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  fireEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );

  // Switch back to admin screen
  card.removeCard();
  await advanceTimersAndPromises(1);
  card.insertCard(adminCard, electionSampleDefinition.electionData);
  await authenticateAdminCard();
  // Change precinct
  fireEvent.change(await screen.findByTestId('selectPrecinct'), {
    target: { value: '23' },
  });
  expect(fetchMock.calls('/config/precinct', { method: 'PUT' })).toHaveLength(
    1
  );
  fetchMock.patch(
    '/config/testMode',
    { body: { status: 'ok' } },
    { overwriteRoutes: true }
  );

  // Remove card and insert pollworker card, verify the right precinct was set
  card.removeCard();
  await advanceTimersAndPromises(1);
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  // Polls should be reset to closed.
  await screen.findByText('Yes, Open the Polls');

  // Switch back to admin screen
  card.removeCard();
  await advanceTimersAndPromises(1);
  card.insertCard(adminCard, electionSampleDefinition.electionData);
  await authenticateAdminCard();

  // Calibrate scanner
  fetchMock.postOnce('/scanner/calibrate', { body: { status: 'ok' } });
  fireEvent.click(await screen.findByText('Calibrate Scanner'));
  await screen.findByText('Waiting for Paper');
  fireEvent.click(await screen.findByText('Cancel'));
  expect(screen.queryByText('Waiting for Paper')).toBeNull();
  fireEvent.click(await screen.findByText('Calibrate Scanner'));
  fetchMock.getOnce(
    '/scanner/status',
    { body: statusReadyToScan },
    { overwriteRoutes: true }
  );
  await advanceTimersAndPromises(1);
  fireEvent.click(await screen.findByText('Calibrate'));
  expect(fetchMock.calls('/scanner/calibrate')).toHaveLength(1);
  fetchMock.getOnce('/scanner/status', {
    body: { ...statusReadyToScan, state: 'calibrated' },
  });
  fetchMock.postOnce('/scanner/wait-for-paper', { body: { status: 'ok' } });
  await advanceTimersAndPromises(1);
  screen.getByText('Calibration succeeded!');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await screen.findByText('Administrator Settings');
  expect(fetchMock.calls('/scanner/wait-for-paper')).toHaveLength(1);

  // Remove card and insert admin card to unconfigure
  fetchMock
    .get(
      '/scanner/status',
      { body: { ...statusNoPaper, canUnconfigure: true } },
      { overwriteRoutes: true }
    )
    .delete('./config/election', {
      body: '{"status": "ok"}',
      status: 200,
    });
  card.removeCard();
  await advanceTimersAndPromises(1);
  card.insertCard(adminCard, electionSampleDefinition.electionData);
  await authenticateAdminCard();
  fireEvent.click(await screen.findByText('Unconfigure Machine'));
  await screen.findByText(
    'Do you want to remove all election information and data from this machine?'
  );
  fireEvent.click(await screen.findByText('Cancel'));
  expect(
    screen.queryByText(
      'Do you want to remove all election information and data from this machine?'
    )
  ).toBeNull();
  fireEvent.click(await screen.findByText('Unconfigure Machine'));
  fireEvent.click(await screen.findByText('Unconfigure'));
  await screen.findByText('Loading');
  await waitFor(() =>
    expect(fetchMock.calls('./config/election', { method: 'DELETE' }))
  );
  expect(window.kiosk.unmountUsbDrive).toHaveBeenCalledTimes(1);
});

test('voter can cast a ballot that scans successfully ', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrinterConnected(false);
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: true });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .getOnce('/scanner/status', { body: statusNoPaper });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');
  await screen.findByText('Scan one ballot sheet at a time.');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  // We use a slight delay on post requests to simulate async response, which is
  // needed to make sure the locking that prevents dup requests works correctly
  fetchMock
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'ready_to_scan' }),
    })
    .postOnce('/scanner/scan', { body: { status: 'ok' } }, { delay: 1 })
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'scanning' }),
    })
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'ready_to_accept' }),
    })
    .postOnce('/scanner/accept', { body: { status: 'ok' } }, { delay: 1 })
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'accepted' }),
    })
    .postOnce(
      '/scanner/wait-for-paper',
      { body: { status: 'ok' } },
      { delay: 1 }
    )
    .get('/scanner/status', {
      body: scannerStatus({ state: 'no_paper', ballotsCounted: 1 }),
    });

  // trigger scan
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText(/Please wait/);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText('Your ballot was counted!');
  await advanceTimersAndPromises(TIME_TO_DISMISS_SUCCESS_SCREEN_MS / 1000);
  await screen.findByText('Scan one ballot sheet at a time.');
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1');
  expect(fetchMock.done()).toBe(true);

  // Insert a pollworker card
  fetchMock.post('/scan/export', {
    _precinctId: '23',
    _ballotStyleId: '12',
    president: ['cramer-vuocolo'],
    senator: [],
    'secretary-of-state': ['shamsi', 'talarico'],
    'county-registrar-of-wills': ['write-in'],
    'judicial-robert-demergue': ['yes'],
  });
  const pollWorkerCard = makePollWorkerCard(
    electionSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to close the polls?');

  // Close Polls
  fireEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText('Polls are closed.');
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 1,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: { kind: PrecinctSelectionKind.AllPrecincts },
      // The export endpoint is mocked to return no CVR data so we still expect a zero tally
      tally: expect.arrayContaining([
        [0, 0, 1, 0, 1, 0, 0, 0, 0, 0], // President expected tally
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], // Senator expected tally
        [0, 1, 1, 0, 0, 0], // Secretary of State expected tally
        [0, 0, 1, 0, 1], // County Registrar of Wills expected tally
        [0, 0, 1, 1, 0], // Judicial Robert Demergue expected tally
      ]),
    })
  );
  expect(kiosk.writeFile).toHaveBeenCalledTimes(1);
  expect(kiosk.writeFile).toHaveBeenCalledWith(
    expect.stringMatching(
      `fake mount point/cast-vote-records/franklin-county_general-election_${electionSampleDefinition.electionHash.slice(
        0,
        10
      )}/TEST__machine_0002__1_ballots`
    ),
    expect.anything()
  );
  expect(fetchMock.calls('/scan/export')).toHaveLength(2);

  // Simulate unmounted usb drive
  kiosk.getUsbDrives.mockResolvedValue([
    fakeUsbDrive({ mountPoint: undefined }),
  ]);
  await advanceTimersAndPromises(2);
  // Remove the usb drive
  kiosk.getUsbDrives.mockResolvedValue([]);
  await advanceTimersAndPromises(2);

  // Remove pollworker card
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Insert Admin Card
  const adminCard = makeAdminCard(
    electionSampleDefinition.electionHash,
    '123456'
  );
  card.insertCard(adminCard, electionSampleDefinition.electionData);
  await authenticateAdminCard();
  await screen.findByText('Administrator Settings');
  fireEvent.click(await screen.findByText('Export Results to USB Drive'));
  await screen.findByText('No USB Drive Detected');
  fireEvent.click(await screen.findByText('Cancel'));
  expect(screen.queryByText('No USB Drive Detected')).toBeNull();
  fireEvent.click(await screen.findByText('Export Results to USB Drive'));
  await screen.findByText('No USB Drive Detected');
  fireEvent.click(await screen.findByText('Cancel'));
  expect(screen.queryByText('No USB Drive Detected')).toBeNull();
  // Insert usb drive
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  await advanceTimersAndPromises(2);
  fireEvent.click(await screen.findByText('Export Results to USB Drive'));

  await screen.findByText('Export Results');
  fireEvent.click(await screen.findByText('Export'));
  await screen.findByText('Results Exported to USB Drive');
  expect(kiosk.writeFile).toHaveBeenCalledTimes(2);
  expect(kiosk.writeFile).toHaveBeenNthCalledWith(
    2,
    expect.stringMatching(
      `fake mount point/cast-vote-records/franklin-county_general-election_${electionSampleDefinition.electionHash.slice(
        0,
        10
      )}/TEST__machine_0002__1_ballots`
    ),
    expect.anything()
  );
  expect(fetchMock.calls('/scan/export')).toHaveLength(3);
  fireEvent.click(await screen.findByText('Eject USB'));
  expect(screen.queryByText('Eject USB')).toBeNull();
  await advanceTimersAndPromises(1);
});

test('voter can cast a ballot that needs review and adjudicate as desired', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: true });
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .getOnce('/scanner/status', { body: statusNoPaper });
  render(<App storage={storage} card={card} hardware={hardware} />);
  await screen.findByText('Insert Your Ballot Below');
  await screen.findByText('Scan one ballot sheet at a time.');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  fetchMock
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'ready_to_scan' }),
    })
    .postOnce('/scanner/scan', { body: { status: 'ok' } }, { delay: 1 })
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'scanning' }),
    })
    .getOnce('/scanner/status', {
      body: scannerStatus({
        state: 'needs_review',
        interpretation: {
          type: 'INTERPRETATION_NEEDS_REVIEW',
          reasons: [{ type: AdjudicationReason.BlankBallot }],
        },
      }),
    });

  // trigger scan
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Blank Ballot');

  fetchMock
    .postOnce('/scanner/accept', { body: { status: 'ok' } }, { delay: 1 })
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'accepted' }),
    })
    .postOnce(
      '/scanner/wait-for-paper',
      { body: { status: 'ok' } },
      { delay: 1 }
    )
    .get('/scanner/status', {
      body: scannerStatus({ state: 'no_paper', ballotsCounted: 1 }),
    });

  fireEvent.click(screen.getByRole('button', { name: 'Count blank ballot' }));
  await screen.findByText('Are you sure?');
  fireEvent.click(
    screen.getByRole('button', { name: 'Yes, count blank ballot' })
  );

  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Your ballot was counted!');
  jest.advanceTimersByTime(TIME_TO_DISMISS_SUCCESS_SCREEN_MS);
  await screen.findByText('Insert Your Ballot Below');
  expect(screen.getByTestId('ballot-count').textContent).toBe('1');
  expect(fetchMock.done()).toBe(true);
});

test('voter can cast a rejected ballot', async () => {
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: true });
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .getOnce('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .getOnce('/scanner/status', { body: statusNoPaper });
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  render(<App storage={storage} card={card} hardware={hardware} />);
  await screen.findByText('Insert Your Ballot Below');
  await screen.findByText('Scan one ballot sheet at a time.');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  fetchMock
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'ready_to_scan' }),
    })
    .postOnce('/scanner/scan', { body: { status: 'ok' } }, { delay: 1 })
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'scanning' }),
    })
    .getOnce('/scanner/status', {
      body: scannerStatus({
        state: 'rejected',
        interpretation: {
          type: 'INTERPRETATION_INVALID',
          reason: 'invalid_election_hash',
        },
      }),
    });

  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Scanning Error');
  screen.getByText(
    'Scanned ballot does not match the election this scanner is configured for.'
  );
  expect(fetchMock.done()).toBe(true);

  // When the voter removes the ballot return to the insert ballot screen
  fetchMock.getOnce('/scanner/status', {
    body: scannerStatus({ state: 'no_paper' }),
  });
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Insert Your Ballot Below');
  expect(fetchMock.done()).toBe(true);
});

test('voter can cast another ballot while the success screen is showing', async () => {
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: true });
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'accepted', ballotsCounted: 1 }),
    });
  render(<App storage={storage} card={card} hardware={hardware} />);
  await screen.findByText('Your ballot was counted!');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  fetchMock.getOnce('/scanner/status', {
    body: scannerStatus({ state: 'accepted', ballotsCounted: 1 }),
  });
  jest.advanceTimersByTime(TIME_TO_DISMISS_SUCCESS_SCREEN_MS / 2);
  screen.getByText('Your ballot was counted!'); // Still on the success screen
  expect(screen.getByTestId('ballot-count').textContent).toBe('1');

  fetchMock
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'ready_to_scan' }),
    })
    .postOnce('/scanner/scan', { body: { status: 'ok' } }, { delay: 1 })
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'scanning' }),
    })
    .get('/scanner/status', {
      body: scannerStatus({
        state: 'needs_review',
        interpretation: {
          type: 'INTERPRETATION_NEEDS_REVIEW',
          reasons: [{ type: AdjudicationReason.BlankBallot }],
        },
      }),
    });

  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Blank Ballot');

  // Even after the timeout to expire the success screen occurs we stay on the review screen.
  jest.advanceTimersByTime(TIME_TO_DISMISS_SUCCESS_SCREEN_MS / 2);
  await screen.findByText('Blank Ballot');

  expect(fetchMock.done()).toBe(true);
});

test('scanning is not triggered when polls closed or cards present', async () => {
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: false });
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    // Set up the status endpoint with 15 ballots scanned
    .get('/scanner/status', {
      body: scannerStatus({ state: 'ready_to_scan', ballotsCounted: 15 }),
    })
    // Mock the scan endpoint just so we can check that we don't hit it
    .post('/scanner/scan', { status: 500 });

  render(<App storage={storage} card={card} hardware={hardware} />);
  await screen.findByText('Polls Closed');
  fetchMock.post('/scan/export', {});
  const pollWorkerCard = makePollWorkerCard(
    electionSampleDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to open the polls?');
  // We should see 15 ballots were scanned
  fireEvent.click(screen.getAllByText('No')[0]);
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('15');
  // Open Polls
  fireEvent.click(await screen.findByText('Open Polls for All Precincts'));
  await screen.findByText('Polls are open.');

  // Once we remove the poll worker card, scanning should start
  fetchMock.post(
    '/scanner/scan',
    { body: { status: 'ok' } },
    { overwriteRoutes: true }
  );
  card.removeCard();
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  expect(fetchMock.done()).toBe(true);
});

test('no printer: poll worker can open and close polls without scanning any ballots', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrinterConnected(false);
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: false });
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { body: statusNoPaper })
    .patchOnce('/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');
  fetchMock.post('/scan/export', {});
  const pollWorkerCard = makePollWorkerCard(
    electionSampleDefinition.electionHash
  );

  // Open Polls Flow
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to open the polls?');
  fireEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Close Polls Flow
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to close the polls?');
  fireEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('with printer: poll worker can open and close polls without scanning any ballots', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: false });
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { body: statusNoPaper })
    .patchOnce('/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');
  fetchMock.post('/scan/export', {});
  const pollWorkerCard = makePollWorkerCard(
    electionSampleDefinition.electionHash
  );

  // Open Polls Flow
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to open the polls?');
  fireEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText('Polls are open.');
  await screen.findByText('Remove the poll worker card.');
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Close Polls Flow
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to close the polls?');
  fireEvent.click(screen.getAllByText('No')[0]);
  fireEvent.click(await screen.findByText('Close Polls for All Precincts'));
  await screen.findByText('Polls are closed.');
  await screen.findByText('Remove the poll worker card.');
  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('no printer: open polls, scan ballot, close polls, export results', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  hardware.setPrinterConnected(false);
  const storage = new MemoryStorage();
  await storage.set(stateStorageKey, { isPollsOpen: false });
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { body: statusNoPaper })
    .patchOnce('/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');
  fetchMock.post('/scan/export', {});
  const pollWorkerCard = makePollWorkerCard(
    electionSampleDefinition.electionHash
  );

  // Open Polls Flow
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to open the polls?');
  fireEvent.click(await screen.findByText('Yes, Open the Polls'));
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Voter scans a ballot
  fetchMock
    .getOnce(
      '/scanner/status',
      { body: scannerStatus({ state: 'ready_to_scan' }) },
      { overwriteRoutes: true }
    )
    .postOnce('/scanner/scan', { body: { status: 'ok' } }, { delay: 1 })
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'scanning' }),
    })
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'ready_to_accept' }),
    })
    .postOnce('/scanner/accept', { body: { status: 'ok' } }, { delay: 1 })
    .getOnce('/scanner/status', {
      body: scannerStatus({ state: 'accepted' }),
    })
    .postOnce(
      '/scanner/wait-for-paper',
      { body: { status: 'ok' } },
      { delay: 1 }
    )
    .get('/scanner/status', {
      body: scannerStatus({ state: 'no_paper', ballotsCounted: 1 }),
    });

  // trigger scan
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText(/Please wait/);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText('Your ballot was counted!');
  await advanceTimersAndPromises(TIME_TO_DISMISS_SUCCESS_SCREEN_MS / 1000);
  await screen.findByText('Scan one ballot sheet at a time.');
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1');
  expect(fetchMock.done()).toBe(true);

  // Close Polls
  fetchMock.post(
    '/scan/export',
    {
      _precinctId: '23',
      _ballotStyleId: '12',
      president: ['cramer-vuocolo'],
      senator: [],
      'secretary-of-state': ['shamsi', 'talarico'],
      'county-registrar-of-wills': ['write-in'],
      'judicial-robert-demergue': ['yes'],
    },
    { overwriteRoutes: true }
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Do you want to close the polls?');

  fireEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText('Polls are closed.');
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  expect(writeLongObjectMock).toHaveBeenCalledTimes(2);
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 1,
      machineId: '0002',
      timeSaved: expect.anything(),
      precinctSelection: { kind: PrecinctSelectionKind.AllPrecincts },
      // The export endpoint is mocked to return no CVR data so we still expect a zero tally
      tally: expect.arrayContaining([
        [0, 0, 1, 0, 1, 0, 0, 0, 0, 0], // President expected tally
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], // Senator expected tally
        [0, 1, 1, 0, 0, 0], // Secretary of State expected tally
        [0, 0, 1, 0, 1], // County Registrar of Wills expected tally
        [0, 0, 1, 1, 0], // Judicial Robert Demergue expected tally
      ]),
    })
  );
  expect(fetchMock.calls('/scan/export')).toHaveLength(3);

  expect(kiosk.writeFile).toHaveBeenCalledTimes(1);
  expect(kiosk.writeFile).toHaveBeenCalledWith(
    expect.stringMatching(
      `fake mount point/cast-vote-records/franklin-county_general-election_${electionSampleDefinition.electionHash.slice(
        0,
        10
      )}/TEST__machine_0002__1_ballots`
    ),
    expect.anything()
  );
  await advanceTimersAndPromises(1);

  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('superadmin card', async () => {
  const card = new MemoryCard();
  const storage = new MemoryStorage();
  const hardware = MemoryHardware.buildStandard();
  hardware.setCardReaderConnected(true);

  const kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = kiosk;

  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scanner/status', { body: statusNoPaper });
  render(<App card={card} storage={storage} hardware={hardware} />);

  card.insertCard(makeSuperadminCard());
  await screen.findByText('Enter the card security code to unlock.');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));

  await screen.findByText('Reboot from USB');
  screen.getByText('Reboot to BIOS');
  screen.getByText('Reset');
  fireEvent.click(screen.getByText('Reset'));

  expect(kiosk.quit).toHaveBeenCalledTimes(1);

  card.removeCard();
});
