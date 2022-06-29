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
  advanceTimers,
  advanceTimersAndPromises,
  makePollWorkerCard,
  makeAdminCard,
  makeSuperadminCard,
  getZeroCompressedTally,
} from '@votingworks/test-utils';
import { join } from 'path';
import { electionSampleDefinition } from '@votingworks/fixtures';

import { DateTime } from 'luxon';
import { AdjudicationReason, PrecinctSelectionKind } from '@votingworks/types';

import { mocked } from 'ts-jest/utils';
import { CARD_POLLING_INTERVAL } from '@votingworks/ui';
import { App } from './app';
import { interpretedHmpb } from '../test/fixtures';

import { stateStorageKey } from './app_root';
import {
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS,
} from './config/globals';
import { MachineConfigResponse } from './config/types';

jest.setTimeout(20000);

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

const scanStatusWaitingForPaperResponseBody: Scan.GetScanStatusResponse = {
  scanner: Scan.ScannerStatus.WaitingForPaper,
  canUnconfigure: false,
  batches: [],
  adjudication: { adjudicated: 0, remaining: 0 },
};

const scanStatusReadyToScanResponseBody: Scan.GetScanStatusResponse = {
  scanner: Scan.ScannerStatus.ReadyToScan,
  canUnconfigure: false,
  batches: [],
  adjudication: { adjudicated: 0, remaining: 0 },
};

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
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody });
  render(<App storage={storage} hardware={hardware} card={card} />);
  await screen.findByText('Card Reader Not Detected');
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
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody });
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
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
    .patchOnce('/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  render(<App card={card} hardware={hardware} storage={storage} />);
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
  await screen.findByText('Administrator Settings');
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
  await screen.findByText('Administrator Settings');
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
  fetchMock.postOnce('/scan/calibrate', { body: { status: 'ok' } });
  fireEvent.click(await screen.findByText('Calibrate Scanner'));
  await screen.findByText('Cannot Calibrate');
  fireEvent.click(await screen.findByText('Cancel'));
  expect(screen.queryByText('Cannot Calibrate')).toBeNull();
  fireEvent.click(await screen.findByText('Calibrate Scanner'));
  fetchMock.get('/scan/status', scanStatusReadyToScanResponseBody, {
    overwriteRoutes: true,
  });
  await advanceTimersAndPromises(1);
  fireEvent.click(await screen.findByText('Calibrate'));
  expect(fetchMock.calls('/scan/calibrate')).toHaveLength(1);
  fetchMock.get('/scan/status', scanStatusWaitingForPaperResponseBody, {
    overwriteRoutes: true,
  });

  // Remove card and insert admin card to unconfigure
  fetchMock.delete('./config/election', {
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
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody });
  render(<App card={card} hardware={hardware} storage={storage} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');
  await screen.findByText('Scan one ballot sheet at a time.');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  fetchMock.get('/scan/status', scanStatusReadyToScanResponseBody, {
    overwriteRoutes: true,
  });

  fetchMock.postOnce('/scan/scanBatch', () => {
    // update status on scan
    fetchMock.get(
      '/scan/status',
      typedAs<Scan.GetScanStatusResponse>({
        scanner: Scan.ScannerStatus.WaitingForPaper,
        canUnconfigure: false,
        batches: [
          {
            id: 'test-batch',
            label: 'Batch 1',
            count: 1,
            startedAt: DateTime.now().toISO(),
            endedAt: DateTime.now().toISO(),
          },
        ],
        adjudication: { adjudicated: 0, remaining: 0 },
      }),
      { overwriteRoutes: true }
    );

    return {
      body: { status: 'ok', batchId: 'test-batch' },
    };
  });

  // trigger scan
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(1);

  await screen.findByText('Your ballot was counted!');
  await advanceTimersAndPromises(
    TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS / 1000
  );
  await screen.findByText('Scan one ballot sheet at a time.');
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1');

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
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody });
  render(<App storage={storage} card={card} hardware={hardware} />);
  advanceTimers(1);
  await screen.findByText('Insert Your Ballot Below');
  await screen.findByText('Scan one ballot sheet at a time.');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  fetchMock.get('/scan/status', scanStatusReadyToScanResponseBody, {
    overwriteRoutes: true,
  });
  fetchMock.post('/scan/scanBatch', () => {
    // update status on scan
    fetchMock.get(
      '/scan/status',
      typedAs<Scan.GetScanStatusResponse>({
        scanner: Scan.ScannerStatus.ReadyToScan,
        canUnconfigure: false,
        batches: [
          {
            id: 'test-batch',
            label: 'Batch 1',
            count: 1,
            startedAt: DateTime.now().toISO(),
          },
        ],
        adjudication: { adjudicated: 0, remaining: 1 },
      }),
      { overwriteRoutes: true }
    );
    fetchMock.get(
      '/scan/hmpb/review/next-sheet',
      typedAs<Scan.GetNextReviewSheetResponse>({
        interpreted: {
          id: 'test-sheet',
          front: {
            interpretation: interpretedHmpb({
              electionDefinition: electionSampleDefinition,
              pageNumber: 1,
              adjudicationReason: AdjudicationReason.Overvote,
            }),
            image: { url: '/not/real.jpg' },
          },
          back: {
            interpretation: interpretedHmpb({
              electionDefinition: electionSampleDefinition,
              pageNumber: 2,
            }),
            image: { url: '/not/real.jpg' },
          },
        },
        layouts: {},
        definitions: {},
      })
    );

    return {
      body: { status: 'ok', batchId: 'test-batch' },
    };
  });

  // trigger scan
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(1);
  await screen.findByText('Ballot Requires Review');

  fetchMock.post('/scan/scanContinue', {
    body: { status: 'ok' },
  });

  fireEvent.click(await screen.findByText('Count Ballot'));
  await screen.findByText('Count ballot with errors?');
  fireEvent.click(await screen.findByText('Yes, count ballot with errors'));
  fetchMock.get(
    '/scan/status',
    typedAs<Scan.GetScanStatusResponse>({
      scanner: Scan.ScannerStatus.WaitingForPaper,
      canUnconfigure: false,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    }),
    { overwriteRoutes: true }
  );
  await screen.findByText('Your ballot was counted!');
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1);
  advanceTimers(5);
  await screen.findByText('Insert Your Ballot Below');
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1');

  // Simulate another ballot
  fetchMock.get(
    '/scan/status',
    typedAs<Scan.GetScanStatusResponse>({
      scanner: Scan.ScannerStatus.ReadyToScan,
      canUnconfigure: false,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    }),
    { overwriteRoutes: true }
  );
  fetchMock.post(
    '/scan/scanBatch',
    () => {
      fetchMock.get(
        '/scan/status',
        typedAs<Scan.GetScanStatusResponse>({
          scanner: Scan.ScannerStatus.ReadyToScan,
          canUnconfigure: false,
          batches: [
            {
              id: 'test-batch',
              label: 'Batch 1',
              count: 1,
              startedAt: DateTime.now().toISO(),
              endedAt: DateTime.now().toISO(),
            },
            {
              id: 'test-batch2',
              label: 'Batch 2',
              count: 1,
              startedAt: DateTime.now().toISO(),
              endedAt: DateTime.now().toISO(),
            },
          ],
          adjudication: { adjudicated: 0, remaining: 1 },
        }),
        { overwriteRoutes: true }
      );
      return {
        body: { status: 'ok', batchId: 'test-batch2' },
      };
    },
    { overwriteRoutes: true }
  );
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Requires Review');
  expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(2);

  // Simulate voter pulling out the ballot
  fetchMock.get(
    '/scan/status',
    typedAs<Scan.GetScanStatusResponse>({
      scanner: Scan.ScannerStatus.WaitingForPaper,
      canUnconfigure: false,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
        {
          id: 'test-batch2',
          label: 'Batch 2',
          count: 0,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    }),
    { overwriteRoutes: true }
  );
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(2);
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
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody });
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  render(<App storage={storage} card={card} hardware={hardware} />);
  advanceTimers(1);
  await screen.findByText('Insert Your Ballot Below');
  await screen.findByText('Scan one ballot sheet at a time.');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  fetchMock.post('/scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  });
  fetchMock.getOnce(
    '/scan/status',
    typedAs<Scan.GetScanStatusResponse>({
      scanner: Scan.ScannerStatus.ReadyToScan,
      canUnconfigure: false,
      batches: [],
      adjudication: { adjudicated: 0, remaining: 0 },
    }),
    { overwriteRoutes: true, repeat: 3 }
  );
  fetchMock.getOnce(
    '/scan/status',
    typedAs<Scan.GetScanStatusResponse>({
      scanner: Scan.ScannerStatus.WaitingForPaper,
      canUnconfigure: false,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    }),
    { overwriteRoutes: false }
  );
  fetchMock.get(
    '/scan/status',
    typedAs<Scan.GetScanStatusResponse>({
      scanner: Scan.ScannerStatus.ReadyToScan,
      canUnconfigure: false,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    }),
    { overwriteRoutes: true }
  );
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<Scan.GetNextReviewSheetResponse>({
      interpreted: {
        id: 'test-sheet',
        front: {
          interpretation: {
            type: 'InvalidElectionHashPage',
            expectedElectionHash: 'a',
            actualElectionHash: 'b',
          },
          image: { url: '/not/real.jpg' },
        },
        back: {
          interpretation: interpretedHmpb({
            electionDefinition: electionSampleDefinition,
            pageNumber: 2,
          }),
          image: { url: '/not/real.jpg' },
        },
      },
      layouts: {},
      definitions: {},
    })
  );
  await advanceTimersAndPromises(1);
  await screen.findByText('Scanning Error');
  await screen.findByText(
    'Scanned ballot does not match the election this scanner is configured for.'
  );
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1);
  fetchMock.post('/scan/scanContinue', {
    body: { status: 'ok' },
  });

  // When the voter removes the ballot return to the insert ballot screen
  fetchMock.get(
    '/scan/status',
    typedAs<Scan.GetScanStatusResponse>({
      scanner: Scan.ScannerStatus.WaitingForPaper,
      canUnconfigure: false,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 0,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    }),
    { overwriteRoutes: true }
  );
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1);
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
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody });
  render(<App storage={storage} card={card} hardware={hardware} />);
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');
  await screen.findByText('Scan one ballot sheet at a time.');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  fetchMock.get('/scan/status', scanStatusReadyToScanResponseBody, {
    overwriteRoutes: true,
  });
  const batch1: Scan.BatchInfo = {
    id: 'test-batch',
    label: 'Batch 1',
    count: 1,
    startedAt: DateTime.now().toISO(),
    endedAt: DateTime.now().toISO(),
  };
  fetchMock.postOnce('/scan/scanBatch', () => {
    // update status on scan
    fetchMock.get(
      '/scan/status',
      typedAs<Scan.GetScanStatusResponse>({
        scanner: Scan.ScannerStatus.WaitingForPaper,
        canUnconfigure: false,
        batches: [batch1],
        adjudication: { adjudicated: 0, remaining: 0 },
      }),
      { overwriteRoutes: true }
    );

    return {
      body: { status: 'ok', batchId: 'test-batch' },
    };
  });
  await advanceTimersAndPromises(1);
  await screen.findByText('Your ballot was counted!');
  expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(1);
  await advanceTimersAndPromises(
    TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS / 2 / 1000
  );
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1');
  await screen.findByText('Your ballot was counted!'); // Still on the success screen
  const batch2: Scan.BatchInfo = {
    id: 'test-batch2',
    label: 'Batch 2',
    count: 1,
    startedAt: DateTime.now().toISO(),
  };
  fetchMock.get(
    '/scan/status',
    typedAs<Scan.GetScanStatusResponse>({
      scanner: Scan.ScannerStatus.ReadyToScan,
      canUnconfigure: false,
      batches: [batch1],
      adjudication: { adjudicated: 0, remaining: 0 },
    }),
    { overwriteRoutes: true, repeat: 3 }
  );
  fetchMock.postOnce(
    '/scan/scanBatch',
    () => {
      // update to include both batches on next scan
      fetchMock.get(
        '/scan/status',
        typedAs<Scan.GetScanStatusResponse>({
          scanner: Scan.ScannerStatus.WaitingForPaper,
          canUnconfigure: false,
          batches: [batch1, batch2],
          adjudication: { adjudicated: 0, remaining: 1 },
        }),
        { overwriteRoutes: true }
      );
      fetchMock.getOnce(
        '/scan/hmpb/review/next-sheet',
        typedAs<Scan.GetNextReviewSheetResponse>({
          interpreted: {
            id: 'test-sheet',
            front: {
              interpretation: interpretedHmpb({
                electionDefinition: electionSampleDefinition,
                pageNumber: 1,
                adjudicationReason: AdjudicationReason.BlankBallot,
              }),
              image: { url: '/not/real.jpg' },
            },
            back: {
              interpretation: interpretedHmpb({
                electionDefinition: electionSampleDefinition,
                pageNumber: 2,
              }),
              image: { url: '/not/real.jpg' },
            },
          },
          layouts: {},
          definitions: {},
        }),
        { overwriteRoutes: true }
      );

      return {
        body: { status: 'ok', batchId: 'test-batch2' },
      };
    },
    { overwriteRoutes: true }
  );

  expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(1);
  await advanceTimersAndPromises(1);
  await waitFor(() =>
    expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(2)
  );
  await screen.findByText('Blank Ballot');
  // Insert more paper
  fetchMock.get(
    '/scan/status',
    typedAs<Scan.GetScanStatusResponse>({
      scanner: Scan.ScannerStatus.ReadyToScan,
      canUnconfigure: false,
      batches: [batch1, batch2],
      adjudication: { adjudicated: 0, remaining: 1 },
    }),
    { overwriteRoutes: true }
  );
  // Even after the timeout to expire the success screen occurs we stay on the review screen.
  await advanceTimersAndPromises(
    TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS / 1000
  );
  await screen.findByText('Blank Ballot');
  // No more ballots have scanned even though the scanner is ready to scan
  expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(2);
  const adminCard = makeAdminCard(
    electionSampleDefinition.electionHash,
    '123456'
  );
  card.insertCard(adminCard, electionSampleDefinition.electionData);
  await authenticateAdminCard();
  await screen.findByText('Administrator Settings');
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1');
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
    .get(
      '/scan/status',
      typedAs<Scan.GetScanStatusResponse>({
        scanner: Scan.ScannerStatus.WaitingForPaper,
        canUnconfigure: false,
        batches: [
          {
            id: 'test-batch',
            label: 'Batch 1',
            count: 15,
            startedAt: DateTime.now().toISO(),
            endedAt: DateTime.now().toISO(),
          },
        ],
        adjudication: { adjudicated: 0, remaining: 0 },
      })
    ); // Set up the status endpoint with 15 ballots scanned
  render(<App storage={storage} card={card} hardware={hardware} />);
  await advanceTimersAndPromises(1);
  await advanceTimersAndPromises(1);
  await screen.findByText('Polls Closed');
  // Make sure we haven't tried to scan
  expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(0);
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
  // Make sure we haven't tried to scan
  await advanceTimersAndPromises(1);
  expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(0);
  // Open Polls
  fireEvent.click(await screen.findByText('Open Polls for All Precincts'));
  await screen.findByText('Polls are open.');
  // Make sure we haven't tried to scan
  await advanceTimersAndPromises(1);
  expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(0);

  card.removeCard();
  await advanceTimersAndPromises(1);
  // We are now polling the status endpoint
  await screen.findByText('Insert Your Ballot Below');
  await advanceTimersAndPromises(1);
  expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(0);
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
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
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
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
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
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
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
  fetchMock.get('/scan/status', scanStatusReadyToScanResponseBody, {
    overwriteRoutes: true,
  });
  fetchMock.postOnce('/scan/scanBatch', () => {
    fetchMock.get(
      '/scan/status',
      typedAs<Scan.GetScanStatusResponse>({
        scanner: Scan.ScannerStatus.WaitingForPaper,
        canUnconfigure: false,
        batches: [
          {
            id: 'test-batch',
            label: 'Batch 1',
            count: 1,
            startedAt: DateTime.now().toISO(),
            endedAt: DateTime.now().toISO(),
          },
        ],
        adjudication: { adjudicated: 0, remaining: 0 },
      }),
      { overwriteRoutes: true }
    );
    return {
      body: { status: 'ok', batchId: 'test-batch' },
    };
  });
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  expect(fetchMock.calls('/scan/scanBatch')).toHaveLength(1);
  await screen.findByText('Your ballot was counted!');
  await advanceTimersAndPromises(
    TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS / 1000
  );
  await screen.findByText('Insert Your Ballot Below');
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1');

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
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody });
  render(<App card={card} storage={storage} hardware={hardware} />);

  const superadmincard = makeSuperadminCard();

  await act(async () => {
    card.insertCard(superadmincard);
    await advanceTimersAndPromises(1);
    await advanceTimersAndPromises(1);
  });

  screen.getByText('Reboot from USB');
  screen.getByText('Reset');
  fireEvent.click(screen.getByText('Reset'));

  expect(kiosk.quit).toHaveBeenCalledTimes(1);

  card.removeCard();
});
