import fetchMock from 'fetch-mock';
import { promises as fs } from 'fs';
import { Scan } from '@votingworks/api';
import {
  ALL_PRECINCTS_SELECTION,
  TallySourceMachineType,
  typedAs,
  readBallotPackageFromFilePointer,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';
import { waitFor, screen, within } from '@testing-library/react';
import {
  fakeKiosk,
  fakeUsbDrive,
  advanceTimersAndPromises,
  makePollWorkerCard,
  makeElectionManagerCard,
  makeSystemAdministratorCard,
  expectPrint,
} from '@votingworks/test-utils';
import { join } from 'path';
import {
  electionSampleDefinition,
  electionSample2Definition,
} from '@votingworks/fixtures';

import { AdjudicationReason } from '@votingworks/types';

import { mocked } from 'ts-jest/utils';
import userEvent from '@testing-library/user-event';

import { stateStorageKey } from './app_root';
import {
  BALLOT_BAG_CAPACITY,
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
} from './config/globals';
import { MachineConfigResponse } from './config/types';
import {
  authenticateElectionManagerCard,
  scannerStatus,
} from '../test/helpers/helpers';
import { REPRINT_REPORT_TIMEOUT_SECONDS } from './screens/poll_worker_screen';
import { SELECT_PRECINCT_TEXT } from './screens/election_manager_screen';
import { fakeFileWriter } from '../test/helpers/fake_file_writer';
import {
  mockPrecinctState,
  mockPrecinctStateChange,
} from '../test/helpers/mock_precinct_state';
import { buildApp } from '../test/helpers/build_app';
import {
  mockPollsState,
  mockPollsStateChange,
} from '../test/helpers/mock_polls_state';

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

const getMachineConfigBody: MachineConfigResponse = {
  machineId: '0002',
  codeVersion: '3.14',
};

const getTestModeConfigTrueResponseBody: Scan.GetTestModeConfigResponse = {
  status: 'ok',
  testMode: true,
};

const deleteElectionConfigResponseBody: Scan.DeleteElectionConfigResponse = {
  status: 'ok',
};

const statusNoPaper = scannerStatus({ state: 'no_paper' });
const statusReadyToScan = scannerStatus({ state: 'ready_to_scan' });

const getPrecinctConfigAllPrecinctsResponseBody: Scan.GetPrecinctSelectionConfigResponse =
  {
    status: 'ok',
    precinctSelection: ALL_PRECINCTS_SELECTION,
  };

const getMarkThresholdOverridesConfigNoMarkThresholdOverridesResponseBody: Scan.GetMarkThresholdOverridesConfigResponse =
  {
    status: 'ok',
  };

let kiosk = fakeKiosk();

const pollWorkerCard = makePollWorkerCard(
  electionSampleDefinition.electionHash
);

const electionManagerCard = makeElectionManagerCard(
  electionSampleDefinition.electionHash,
  '123456'
);

beforeEach(() => {
  jest.useFakeTimers();

  kiosk = fakeKiosk();
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  kiosk.writeFile.mockResolvedValue(
    fakeFileWriter() as unknown as ReturnType<KioskBrowser.Kiosk['writeFile']>
  );
  window.kiosk = kiosk;

  fetchMock.reset();
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
    .get('/precinct-scanner/config/polls', {
      body: { status: 'ok', pollsState: 'polls_closed_initial' },
    });
});

test('shows setup card reader screen when there is no card reader', async () => {
  const { hardware, renderApp } = buildApp();
  hardware.setCardReaderConnected(false);
  fetchMock.get('/precinct-scanner/scanner/status', { body: statusNoPaper });
  renderApp();
  await screen.findByText('Card Reader Not Detected');
});

test('shows insert USB Drive screen when there is no card reader', async () => {
  kiosk.getUsbDrives.mockResolvedValue([]);
  fetchMock.get('/precinct-scanner/scanner/status', { body: statusNoPaper });
  buildApp().renderApp();
  await screen.findByText('No USB Drive Detected');
});

test('initializes app with stored state', async () => {
  const { storage, card, renderApp } = buildApp();
  await storage.set(stateStorageKey, { isSoundMuted: true });
  fetchMock.get('/precinct-scanner/scanner/status', { body: statusNoPaper });
  renderApp();

  card.insertCard(electionManagerCard);
  await authenticateElectionManagerCard();
  await screen.findByText('Unmute Sounds');
});

test('app can load and configure from a usb stick', async () => {
  kiosk.getUsbDrives.mockResolvedValue([]);
  fetchMock
    .getOnce('/precinct-scanner/config/election', new Response('null'), {
      overwriteRoutes: true,
    })
    .get('/precinct-scanner/scanner/status', { body: statusNoPaper });
  buildApp().renderApp();
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
    .patchOnce('/precinct-scanner/config/election', {
      body: typedAs<Scan.PatchElectionConfigResponse>({ status: 'ok' }),
      status: 200,
    })
    .post('/precinct-scanner/config/addTemplates', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .get('/precinct-scanner/config/election', electionSampleDefinition, {
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
  expect(
    fetchMock.calls('/precinct-scanner/config/election', { method: 'PATCH' })
  ).toHaveLength(1);
  expect(fetchMock.calls('/precinct-scanner/config/addTemplates')).toHaveLength(
    16
  );

  expect(readBallotPackageFromFilePointerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'ballot-package-new.zip',
    })
  );
});

test('election manager must set precinct', async () => {
  mockPrecinctState(undefined);
  fetchMock.get('/precinct-scanner/scanner/status', { body: statusNoPaper });
  const { card, renderApp } = buildApp();
  renderApp();
  await screen.findByText('No Precinct Selected');

  // Poll Worker card does nothing
  card.insertCard(pollWorkerCard);
  await screen.findByText('No Precinct Selected');
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Insert Election Manager card and set precinct
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await authenticateElectionManagerCard();
  screen.getByText(SELECT_PRECINCT_TEXT);
  mockPrecinctStateChange(singlePrecinctSelectionFor('23'));
  userEvent.selectOptions(await screen.findByTestId('selectPrecinct'), '23');
  card.removeCard();
  // Confirm precinct is set and correct
  await screen.findByText('Polls Closed');
  screen.getByText('Center Springfield,');

  // Poll Worker card can be used to open polls now
  fetchMock.post('/precinct-scanner/export', {});
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
});

test('election manager and poll worker configuration', async () => {
  const { card, renderApp, logger } = buildApp();
  fetchMock
    .get('/precinct-scanner/scanner/status', { body: statusNoPaper })
    .patchOnce('/precinct-scanner/config/testMode', {
      body: typedAs<Scan.PatchTestModeConfigResponse>({ status: 'ok' }),
      status: 200,
    });
  renderApp();
  await screen.findByText('Polls Closed');

  // Calibrate scanner as Election Manager
  fetchMock.post('/precinct-scanner/scanner/calibrate', {
    body: { status: 'ok' },
  });
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await authenticateElectionManagerCard();
  userEvent.click(await screen.findByText('Calibrate Scanner'));
  await screen.findByText('Waiting for Paper');
  userEvent.click(await screen.findByText('Cancel'));
  expect(screen.queryByText('Waiting for Paper')).toBeNull();
  userEvent.click(await screen.findByText('Calibrate Scanner'));
  fetchMock
    .getOnce(
      '/precinct-scanner/scanner/status',
      { body: statusReadyToScan },
      { overwriteRoutes: true }
    )
    .get('/precinct-scanner/scanner/status', { body: statusNoPaper });
  await advanceTimersAndPromises();
  userEvent.click(await screen.findByText('Calibrate'));
  expect(fetchMock.calls('/precinct-scanner/scanner/calibrate')).toHaveLength(
    1
  );
  await advanceTimersAndPromises();
  await screen.findByText('Calibration succeeded!');
  userEvent.click(screen.getByRole('button', { name: 'Close' }));

  // Change mode as Election Manager
  userEvent.click(await screen.findByText('Live Election Mode'));
  await screen.findByText('Loading');
  await advanceTimersAndPromises(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogin,
    'election_manager',
    expect.objectContaining({ disposition: 'success' })
  );
  expect(
    fetchMock.calls('/precinct-scanner/config/testMode', { method: 'PATCH' })
  ).toHaveLength(1);

  // Change precinct as Election Manager
  mockPrecinctStateChange(singlePrecinctSelectionFor('23'));
  userEvent.selectOptions(await screen.findByTestId('selectPrecinct'), '23');
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Open the polls
  fetchMock.post('/precinct-scanner/export', {});
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  expect(fetchMock.calls('/precinct-scanner/export')).toHaveLength(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogin,
    'poll_worker',
    expect.objectContaining({ disposition: 'success' })
  );
  mockPollsStateChange('polls_open');
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Change precinct as Election Manager with polls open
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await authenticateElectionManagerCard();
  userEvent.click(screen.getByText('Change Precinct'));
  screen.getByText(/WARNING/);
  mockPrecinctStateChange(singlePrecinctSelectionFor('20'));
  mockPollsState('polls_closed_initial');
  userEvent.selectOptions(await screen.findByTestId('selectPrecinct'), '20');
  userEvent.click(screen.getByText('Confirm'));
  card.removeCard();
  await screen.findByText('Polls Closed');
  await screen.findByText('South Springfield,');

  // Open the polls again
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  expect(fetchMock.calls('/precinct-scanner/export')).toHaveLength(2);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogin,
    'poll_worker',
    expect.objectContaining({ disposition: 'success' })
  );
  mockPollsStateChange('polls_open');
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await advanceTimersAndPromises(1);

  // Remove card and insert election manager card to unconfigure
  fetchMock
    .get(
      '/precinct-scanner/scanner/status',
      { body: { ...statusNoPaper, canUnconfigure: true, ballotsCounted: 1 } },
      { overwriteRoutes: true }
    )
    .delete('./precinct-scanner/config/election', {
      body: '{"status": "ok"}',
      status: 200,
    });
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await authenticateElectionManagerCard();
  // Confirm we can't unconfigure just by changing precinct
  expect(screen.queryByTestId('selectPrecinct')).not.toBeInTheDocument();
  userEvent.click(
    await screen.findByText('Delete All Election Data from VxScan')
  );
  await screen.findByText(
    'Do you want to remove all election information and data from this machine?'
  );
  userEvent.click(await screen.findByText('Cancel'));
  expect(
    screen.queryByText(
      'Do you want to remove all election information and data from this machine?'
    )
  ).toBeNull();
  userEvent.click(
    await screen.findByText('Delete All Election Data from VxScan')
  );
  userEvent.click(await screen.findByText('Yes, Delete All'));
  await screen.findByText('Loading');
  await waitFor(() =>
    expect(
      fetchMock.calls('./precinct-scanner/config/election', {
        method: 'DELETE',
      })
    )
  );
  expect(kiosk.unmountUsbDrive).toHaveBeenCalledTimes(1);
});

test('voter can cast a ballot that scans successfully ', async () => {
  const { card, renderApp } = buildApp();
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  mockPollsState('polls_open');
  fetchMock.get('/precinct-scanner/scanner/status', {
    body: statusNoPaper,
  });
  renderApp();
  await screen.findByText('Insert Your Ballot Below');
  screen.getByText('Scan one ballot sheet at a time.');
  screen.getByText('General Election');
  screen.getByText(/Franklin County/);
  screen.getByText(/State of Hamilton/);
  screen.getByText('Election ID');
  screen.getByText('748dc61ad3');
  fetchMock
    .getOnce(
      '/precinct-scanner/scanner/status',
      {
        body: scannerStatus({ state: 'ready_to_scan' }),
      },
      { overwriteRoutes: true }
    )
    .post('/precinct-scanner/scanner/scan', { body: { status: 'ok' } })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'scanning' }),
    })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'ready_to_accept' }),
    })
    .post('/precinct-scanner/scanner/accept', { body: { status: 'ok' } })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'accepted' }),
    })
    .get('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'no_paper', ballotsCounted: 1 }),
    });

  // trigger scan
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText(/Please wait/);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText('Your ballot was counted!');
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await screen.findByText('Scan one ballot sheet at a time.');
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1');
  expect(fetchMock.done()).toBe(true);
  // Insert a pollworker card
  fetchMock.post('/precinct-scanner/export', {
    _precinctId: '23',
    _ballotStyleId: '12',
    president: ['cramer-vuocolo'],
    senator: [],
    'secretary-of-state': ['shamsi', 'talarico'],
    'county-registrar-of-wills': ['write-in'],
    'judicial-robert-demergue': ['yes'],
  });

  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');

  // Close Polls
  mockPollsStateChange('polls_closed_final');
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
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
      precinctSelection: ALL_PRECINCTS_SELECTION,
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
    )
  );
  expect(fetchMock.calls('/precinct-scanner/export')).toHaveLength(2);

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

  // Insert Election Manager Card
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await authenticateElectionManagerCard();
  await screen.findByText('Election Manager Settings');
  userEvent.click(await screen.findByText('Save CVRs'));
  await screen.findByText('No USB Drive Detected');
  userEvent.click(await screen.findByText('Cancel'));
  expect(screen.queryByText('No USB Drive Detected')).toBeNull();
  userEvent.click(await screen.findByText('Save CVRs'));
  await screen.findByText('No USB Drive Detected');
  userEvent.click(await screen.findByText('Cancel'));
  expect(screen.queryByText('No USB Drive Detected')).toBeNull();
  // Insert usb drive
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  await advanceTimersAndPromises(2);
  userEvent.click(await screen.findByText('Save CVRs'));

  expect(screen.getAllByText('Save CVRs')).toHaveLength(2);
  userEvent.click(await screen.findByText('Save'));
  await screen.findByText('CVRs Saved to USB Drive');
  expect(kiosk.writeFile).toHaveBeenCalledTimes(2);
  expect(kiosk.writeFile).toHaveBeenNthCalledWith(
    2,
    expect.stringMatching(
      `fake mount point/cast-vote-records/franklin-county_general-election_${electionSampleDefinition.electionHash.slice(
        0,
        10
      )}/TEST__machine_0002__1_ballots`
    )
  );
  expect(fetchMock.calls('/precinct-scanner/export')).toHaveLength(3);
  userEvent.click(await screen.findByText('Eject USB'));
  expect(screen.queryByText('Eject USB')).toBeNull();
  await advanceTimersAndPromises(1);
});

test('voter can cast a ballot that needs review and adjudicate as desired', async () => {
  mockPollsState('polls_open');
  fetchMock.getOnce('/precinct-scanner/scanner/status', {
    body: statusNoPaper,
  });
  buildApp().renderApp();
  await screen.findByText('Insert Your Ballot Below');
  await screen.findByText('Scan one ballot sheet at a time.');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  const interpretation: Scan.SheetInterpretation = {
    type: 'NeedsReviewSheet',
    reasons: [{ type: AdjudicationReason.BlankBallot }],
  };
  fetchMock
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'ready_to_scan' }),
    })
    .post('/precinct-scanner/scanner/scan', { body: { status: 'ok' } })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'scanning' }),
    })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'needs_review', interpretation }),
    });

  // trigger scan
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('No votes were found when scanning this ballot.');

  fetchMock
    .post('/precinct-scanner/scanner/accept', { body: { status: 'ok' } })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'accepting_after_review', interpretation }),
    })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'accepted', interpretation }),
    })
    .get('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'no_paper', ballotsCounted: 1 }),
    });

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  await screen.findByText('Are you sure?');
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );

  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Your ballot was counted!');
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Insert Your Ballot Below');
  expect(screen.getByTestId('ballot-count').textContent).toBe('1');
  expect(fetchMock.done()).toBe(true);
});

test('voter can cast a rejected ballot', async () => {
  mockPollsState('polls_open');
  fetchMock.getOnce('/precinct-scanner/scanner/status', {
    body: statusNoPaper,
  });
  buildApp().renderApp();
  await screen.findByText('Insert Your Ballot Below');
  await screen.findByText('Scan one ballot sheet at a time.');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  fetchMock
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'ready_to_scan' }),
    })
    .post('/precinct-scanner/scanner/scan', { body: { status: 'ok' } })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'scanning' }),
    })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({
        state: 'rejected',
        interpretation: {
          type: 'InvalidSheet',
          reason: 'invalid_election_hash',
        },
      }),
    });

  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('Ballot Not Counted');
  screen.getByText(
    'The ballot does not match the election this scanner is configured for.'
  );
  expect(fetchMock.done()).toBe(true);

  // When the voter removes the ballot return to the insert ballot screen
  fetchMock.getOnce('/precinct-scanner/scanner/status', {
    body: scannerStatus({ state: 'no_paper' }),
  });
  await screen.findByText('Insert Your Ballot Below');
  expect(fetchMock.done()).toBe(true);
});

test('voter can cast another ballot while the success screen is showing', async () => {
  mockPollsState('polls_open');
  fetchMock.getOnce('/precinct-scanner/scanner/status', {
    body: scannerStatus({ state: 'accepted', ballotsCounted: 1 }),
  });
  buildApp().renderApp();
  await screen.findByText('Your ballot was counted!');
  await screen.findByText('General Election');
  await screen.findByText(/Franklin County/);
  await screen.findByText(/State of Hamilton/);
  await screen.findByText('Election ID');
  await screen.findByText('748dc61ad3');

  fetchMock.getOnce('/precinct-scanner/scanner/status', {
    body: scannerStatus({ state: 'accepted', ballotsCounted: 1 }),
  });
  screen.getByText('Your ballot was counted!');
  expect(screen.getByTestId('ballot-count').textContent).toBe('1');

  fetchMock
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'ready_to_scan' }),
    })
    .post('/precinct-scanner/scanner/scan', { body: { status: 'ok' } })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'scanning' }),
    })
    .get('/precinct-scanner/scanner/status', {
      body: scannerStatus({
        state: 'needs_review',
        interpretation: {
          type: 'NeedsReviewSheet',
          reasons: [{ type: AdjudicationReason.BlankBallot }],
        },
      }),
    });

  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText('No votes were found when scanning this ballot.');

  expect(fetchMock.done()).toBe(true);
});

test('scanning is not triggered when polls closed or cards present', async () => {
  fetchMock
    // Set up the status endpoint with 15 ballots scanned
    .get('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'ready_to_scan', ballotsCounted: 15 }),
    })
    // Mock the scan endpoint just so we can check that we don't hit it
    .post('/precinct-scanner/scanner/scan', { status: 500 });
  const { card, renderApp } = buildApp();
  renderApp();
  await screen.findByText('Polls Closed');
  fetchMock.post('/precinct-scanner/export', {});
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  // We should see 15 ballots were scanned
  userEvent.click(screen.getAllByText('No')[0]);
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('15');
  // Open Polls
  mockPollsStateChange('polls_open');
  userEvent.click(await screen.findByText('Open Polls for All Precincts'));
  await screen.findByText('Polls are open.');

  // Once we remove the poll worker card, scanning should start
  fetchMock.post(
    '/precinct-scanner/scanner/scan',
    { body: { status: 'ok' } },
    { overwriteRoutes: true }
  );
  card.removeCard();
  jest.advanceTimersByTime(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS);
  await screen.findByText(/Please wait/);
  expect(fetchMock.done()).toBe(true);
});

test('no printer: poll worker can open and close polls without scanning any ballots', async () => {
  fetchMock.get('/precinct-scanner/scanner/status', { body: statusNoPaper });
  const { card, renderApp } = buildApp();
  renderApp();
  await screen.findByText('Polls Closed');
  fetchMock.post('/precinct-scanner/export', {});

  // Open Polls Flow
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  mockPollsStateChange('polls_open');
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Close Polls Flow
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  mockPollsStateChange('polls_closed_final');
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('with printer: poll worker can open and close polls without scanning any ballots', async () => {
  fetchMock.get('/precinct-scanner/scanner/status', { body: statusNoPaper });
  const { card, renderApp } = buildApp(true);
  renderApp();
  await screen.findByText('Polls Closed');
  fetchMock.post('/precinct-scanner/export', {});

  // Open Polls Flow
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  mockPollsStateChange('polls_open');
  userEvent.click(screen.getByRole('button', { name: 'Yes, Open the Polls' }));
  await screen.findByText('Polls are open.');
  await expectPrint();
  userEvent.click(
    screen.getByRole('button', { name: 'Print Additional Polls Opened Report' })
  );
  await screen.findByText('Printing Report…');
  await expectPrint();
  await advanceTimersAndPromises(REPRINT_REPORT_TIMEOUT_SECONDS);
  await screen.findByText('Polls are open.');
  screen.getByRole('button', { name: 'Print Additional Polls Opened Report' });
  screen.getByText('Remove the poll worker card', { exact: false });
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Close Polls Flow
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  mockPollsStateChange('polls_closed_final');
  userEvent.click(screen.getByRole('button', { name: 'Yes, Close the Polls' }));
  await screen.findByText('Polls are closed.');
  await expectPrint();
  userEvent.click(
    screen.getByRole('button', { name: 'Print Additional Polls Closed Report' })
  );
  await screen.findByText('Printing Report…');
  await expectPrint();
  await advanceTimersAndPromises(REPRINT_REPORT_TIMEOUT_SECONDS);
  await screen.findByText('Polls are closed.');
  screen.getByRole('button', { name: 'Print Additional Polls Closed Report' });
  screen.getByText('Remove the poll worker card', { exact: false });
  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('no printer: open polls, scan ballot, close polls, save results', async () => {
  fetchMock.get('/precinct-scanner/scanner/status', { body: statusNoPaper });
  const { card, renderApp } = buildApp();
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject');
  renderApp();
  await screen.findByText('Polls Closed');
  fetchMock.post('/precinct-scanner/export', {});

  // Open Polls Flow
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  mockPollsStateChange('polls_open');
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1);
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Voter scans a ballot
  fetchMock
    .getOnce(
      '/precinct-scanner/scanner/status',
      { body: scannerStatus({ state: 'ready_to_scan' }) },
      { overwriteRoutes: true }
    )
    .post('/precinct-scanner/scanner/scan', { body: { status: 'ok' } })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'scanning' }),
    })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'ready_to_accept' }),
    })
    .post('/precinct-scanner/scanner/accept', { body: { status: 'ok' } })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'accepted' }),
    })
    .get('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'no_paper', ballotsCounted: 1 }),
    });

  // trigger scan
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText(/Please wait/);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText('Your ballot was counted!');
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await screen.findByText('Scan one ballot sheet at a time.');
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1');
  expect(fetchMock.done()).toBe(true);

  // Close Polls
  fetchMock.post(
    '/precinct-scanner/export',
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
  await screen.findByText('Do you want to close the polls?');
  mockPollsStateChange('polls_closed_final');
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
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
      precinctSelection: ALL_PRECINCTS_SELECTION,
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
  expect(fetchMock.calls('/precinct-scanner/export')).toHaveLength(3);

  expect(kiosk.writeFile).toHaveBeenCalledTimes(1);
  expect(kiosk.writeFile).toHaveBeenCalledWith(
    expect.stringMatching(
      `fake mount point/cast-vote-records/franklin-county_general-election_${electionSampleDefinition.electionHash.slice(
        0,
        10
      )}/TEST__machine_0002__1_ballots`
    )
  );
  await advanceTimersAndPromises(1);

  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('poll worker can open, pause, unpause, and close poll without scanning any ballots', async () => {
  fetchMock.get('/precinct-scanner/scanner/status', { body: statusNoPaper });
  const { card, renderApp } = buildApp();
  renderApp();
  await screen.findByText('Polls Closed');
  fetchMock.post('/precinct-scanner/export', {});

  // Open Polls
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  mockPollsStateChange('polls_open');
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Pause Polls Flow
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  userEvent.click(await screen.findByText('No'));
  mockPollsStateChange('polls_paused');
  userEvent.click(await screen.findByText('Pause Polls for All Precincts'));
  await screen.findByText('Pausing Polls…');
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Polls Paused');

  // Unpause Polls Flow
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to open the polls?');
  mockPollsStateChange('polls_open');
  userEvent.click(await screen.findByText('Yes, Open the Polls'));
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Insert Your Ballot Below');

  // Close Polls Flow
  card.insertCard(pollWorkerCard);
  await screen.findByText('Do you want to close the polls?');
  mockPollsStateChange('polls_closed_final');
  userEvent.click(await screen.findByText('Yes, Close the Polls'));
  await screen.findByText('Closing Polls…');
  await screen.findByText(
    'Insert poll worker card into VxMark to print the report.'
  );
  card.removeCard();
  await screen.findByText('Polls Closed');
});

test('system administrator can log in and unconfigure machine', async () => {
  fetchMock
    .get('/precinct-scanner/scanner/status', { body: statusNoPaper })
    .delete('/precinct-scanner/config/election?ignoreBackupRequirement=true', {
      body: deleteElectionConfigResponseBody,
    });
  const { card, renderApp } = buildApp();
  renderApp();

  card.insertCard(makeSystemAdministratorCard());
  await screen.findByText('Enter the card security code to unlock.');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));

  await screen.findByRole('button', { name: 'Reboot from USB' });
  screen.getByRole('button', { name: 'Reboot to BIOS' });
  const unconfigureMachineButton = screen.getByRole('button', {
    name: 'Unconfigure Machine',
  });

  userEvent.click(unconfigureMachineButton);
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', {
      name: 'Yes, Delete Election Data',
    })
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

  card.removeCard();
});

test('system administrator allowed to log in on unconfigured machine', async () => {
  fetchMock
    .get(
      '/precinct-scanner/config/election',
      { body: null },
      { overwriteRoutes: true }
    )
    .get('/precinct-scanner/scanner/status', { body: statusNoPaper });

  const { card, renderApp } = buildApp();
  renderApp();

  card.insertCard(makeSystemAdministratorCard());
  await screen.findByText('Enter the card security code to unlock.');
});

test('system administrator can reset polls to paused', async () => {
  mockPollsState('polls_closed_final');
  fetchMock
    .get('/precinct-scanner/scanner/status', { body: statusNoPaper })
    .delete('/precinct-scanner/config/election?ignoreBackupRequirement=true', {
      body: deleteElectionConfigResponseBody,
    });
  const { card, renderApp } = buildApp();
  renderApp();
  await screen.findByText('Polls Closed');

  card.insertCard(makeSystemAdministratorCard());
  await screen.findByText('Enter the card security code to unlock.');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));

  userEvent.click(
    await screen.findByRole('button', { name: 'Reset Polls to Paused' })
  );
  const modal = await screen.findByRole('alertdialog');
  mockPollsStateChange('polls_paused');
  userEvent.click(
    await within(modal).findByRole('button', { name: 'Reset Polls to Paused' })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  card.removeCard();
  await screen.findByText('Polls Paused');
});

test('election manager cannot auth onto machine with different election hash', async () => {
  fetchMock.get('/precinct-scanner/scanner/status', { body: statusNoPaper });

  const { card, renderApp } = buildApp();
  renderApp();

  card.insertCard(
    makeElectionManagerCard(electionSample2Definition.electionHash)
  );
  await screen.findByText('Invalid Card');
});

test('replace ballot bag flow', async () => {
  mockPollsState('polls_open');
  fetchMock.getOnce('/precinct-scanner/scanner/status', {
    body: statusNoPaper,
  });
  const { card, renderApp } = buildApp();
  renderApp();
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  fetchMock
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'ready_to_scan' }),
    })
    .post('/precinct-scanner/scanner/scan', { body: { status: 'ok' } })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'scanning' }),
    })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'ready_to_accept' }),
    })
    .post('/precinct-scanner/scanner/accept', { body: { status: 'ok' } })
    .getOnce('/precinct-scanner/scanner/status', {
      body: scannerStatus({ state: 'accepted' }),
    })
    .get('/precinct-scanner/scanner/status', {
      body: scannerStatus({
        state: 'no_paper',
        ballotsCounted: BALLOT_BAG_CAPACITY,
      }),
    });

  // trigger scan
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  screen.getByText(/Please wait/);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);

  // we should see still see accepted screen
  screen.getByText('Your ballot was counted!');
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_SCANNER_STATUS_MS / 1000);

  // should go to modal after accepted screen
  await screen.findByText('Ballot Bag Full');

  // Insert a pollworker card to enter confirmation step
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Bag Replaced?');

  // Removing card at this point returns to initial screen
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Bag Full');

  // Can confirm with pollworker card
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Bag Replaced?');
  userEvent.click(screen.getByText('Yes, New Ballot Bag is Ready'));

  // Prompted to remove card
  await advanceTimersAndPromises(1);
  await screen.findByText('Remove card to resume voting.');

  // Removing card returns to voter screen
  card.removeCard();
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  // Does not prompt again if new threshold hasn't been reached
  fetchMock.restore();
  fetchMock.get('/precinct-scanner/scanner/status', {
    body: scannerStatus({
      state: 'no_paper',
      ballotsCounted: BALLOT_BAG_CAPACITY * 2 - 1,
    }),
  });
  await advanceTimersAndPromises(1);
  await screen.findByText('Insert Your Ballot Below');

  // Prompts again if new threshold has been reached
  fetchMock.restore();
  fetchMock.get('/precinct-scanner/scanner/status', {
    body: scannerStatus({
      state: 'no_paper',
      ballotsCounted: BALLOT_BAG_CAPACITY * 2,
    }),
  });
  await advanceTimersAndPromises(1);
  await screen.findByText('Ballot Bag Full');
});

test('uses storage for frontend state', async () => {
  mockPollsState('polls_open');
  const { card, storage, renderApp } = buildApp();
  await storage.set(stateStorageKey, {
    isSoundMuted: true,
    ballotCountWhenBallotBagLastReplaced: BALLOT_BAG_CAPACITY,
  });
  fetchMock.get('/precinct-scanner/scanner/status', {
    body: scannerStatus({
      state: 'no_paper',
      ballotsCounted: BALLOT_BAG_CAPACITY,
    }),
  });
  renderApp();
  await screen.findByText('Insert Your Ballot Below');

  // Confirm muted status loaded from storage
  card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
  await authenticateElectionManagerCard();
  await screen.findByText('Unmute Sounds');

  // Confirm muted status is saved to storage
  userEvent.click(screen.getByText('Unmute Sounds'));
  await advanceTimersAndPromises(1);
  expect(await storage.get(stateStorageKey)).toMatchObject({
    isSoundMuted: false,
  });
  card.removeCard();

  // Confirm ballot bag status is saved to storage
  fetchMock.get(
    '/precinct-scanner/scanner/status',
    {
      body: scannerStatus({
        state: 'no_paper',
        ballotsCounted: BALLOT_BAG_CAPACITY * 2,
      }),
    },
    { overwriteRoutes: true }
  );
  await screen.findByText('Ballot Bag Full');
  card.insertCard(pollWorkerCard);
  userEvent.click(await screen.findByText('Yes, New Ballot Bag is Ready'));
  card.removeCard();
  await advanceTimersAndPromises(1);
  expect(await storage.get(stateStorageKey)).toMatchObject({
    ballotCountWhenBallotBagLastReplaced: BALLOT_BAG_CAPACITY * 2,
  });
});
