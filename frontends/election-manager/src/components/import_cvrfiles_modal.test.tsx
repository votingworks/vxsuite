import React from 'react';
import {
  waitFor,
  fireEvent,
  getByText as domGetByText,
  getByTestId as domGetByTestId,
  screen,
} from '@testing-library/react';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';

import { Admin } from '@votingworks/api';
import {
  BallotIdSchema,
  CastVoteRecord,
  unsafeParse,
} from '@votingworks/types';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { UsbDriveStatus } from '@votingworks/ui';
import { ImportCvrFilesModal } from './import_cvrfiles_modal';
import {
  renderInAppContext,
  eitherNeitherElectionDefinition,
} from '../../test/render_in_app_context';
import { CastVoteRecordFiles } from '../utils/cast_vote_record_files';
import { ElectionManagerStoreMemoryBackend } from '../lib/backends';
import { mockUsbDrive } from '../../test/helpers/mock_usb_drive';

const TEST_FILE1 = 'TEST__machine_0001__10_ballots__2020-12-09_15-49-32.jsonl';
const TEST_FILE2 = 'TEST__machine_0003__5_ballots__2020-12-07_15-49-32.jsonl';
const LIVE_FILE1 = 'machine_0002__10_ballots__2020-12-09_15-59-32.jsonl';

test('No USB screen shows when there is no USB drive', async () => {
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: eitherNeitherElectionDefinition,
  });

  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected'];

  for (const usbStatus of usbStatuses) {
    const closeFn = jest.fn();
    const { unmount, getByText } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      { backend, usbDrive: mockUsbDrive(usbStatus) }
    );
    await screen.findByText('No USB Drive Detected');

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);
    unmount();
  }
});

test('Loading screen show while usb is mounting or ejecting', () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const usbStatus of usbStatuses) {
    const closeFn = jest.fn();
    const { unmount, getByText } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      { usbDrive: mockUsbDrive(usbStatus) }
    );
    getByText('Loading');
    unmount();
  }
});

describe('Screens display properly when USB is mounted', () => {
  beforeEach(() => {
    const mockKiosk = fakeKiosk();
    mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
    window.kiosk = mockKiosk;
  });

  afterEach(() => {
    delete window.kiosk;
  });

  test('No files found screen shows when mounted usb has no valid files', async () => {
    const closeFn = jest.fn();
    const logger = fakeLogger();
    const backend = new ElectionManagerStoreMemoryBackend({
      electionDefinition: eitherNeitherElectionDefinition,
    });
    const { getByText, getByTestId } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDrive: mockUsbDrive('mounted'),
        logger,
        backend,
      }
    );
    await waitFor(() =>
      getByText(
        /There were no new CVR files automatically found on this USB drive/
      )
    );

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    jest.spyOn(backend, 'addCastVoteRecordFile').mockResolvedValueOnce({
      wasExistingFile: false,
      newlyAdded: 0,
      alreadyPresent: 0,
      exportedTimestamp: new Date().toISOString(),
      fileMode: Admin.CvrFileMode.Test,
      fileName: 'cvrs.jsonl',
      id: 'cvr-file-1',
      scannerIds: ['scanner-2', 'scanner-3'],
    });

    // You can still manually load files
    fireEvent.change(getByTestId('manual-input'), {
      target: { files: [new File([''], 'file.jsonl')] },
    });
    await screen.findByText('0 new CVRs Loaded');
    expect(backend.addCastVoteRecordFile).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.CvrFilesReadFromUsb,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    );
  });

  test('Load CVR files screen shows table with test and live CVRs', async () => {
    const closeFn = jest.fn();
    const fileEntries = [
      {
        name: LIVE_FILE1,
        type: 1,
        path: 'live1',
      },
      {
        name: TEST_FILE1,
        type: 1,
        path: 'test1',
      },
      {
        name: TEST_FILE2,
        type: 1,
        path: 'test2',
      },
    ];
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(fileEntries);
    const logger = fakeLogger();
    const backend = new ElectionManagerStoreMemoryBackend({
      electionDefinition: eitherNeitherElectionDefinition,
    });
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDrive: mockUsbDrive('mounted'),
        logger,
        backend,
      }
    );
    await screen.findByText('Load CVR Files');
    getByText(
      /The following CVR files were automatically found on this USB drive./
    );

    const tableRows = getAllByTestId('table-row');
    expect(tableRows).toHaveLength(3);
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM');
    domGetByText(tableRows[0], '0002');
    expect(domGetByText(tableRows[0], 'Load').closest('button')!.disabled).toBe(
      false
    );
    domGetByText(tableRows[1], '12/09/2020 03:49:32 PM');
    domGetByText(tableRows[1], '0001');
    expect(domGetByText(tableRows[1], 'Load').closest('button')!.disabled).toBe(
      false
    );
    domGetByText(tableRows[2], '12/07/2020 03:49:32 PM');
    domGetByText(tableRows[2], '0003');
    expect(domGetByText(tableRows[2], 'Load').closest('button')!.disabled).toBe(
      false
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.CvrFilesReadFromUsb,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    );

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    jest.spyOn(backend, 'addCastVoteRecordFile').mockResolvedValueOnce({
      wasExistingFile: false,
      newlyAdded: 0,
      alreadyPresent: 0,
      exportedTimestamp: new Date().toISOString(),
      fileMode: Admin.CvrFileMode.Test,
      fileName: 'cvrs.jsonl',
      id: 'cvr-file-1',
      scannerIds: ['scanner-2', 'scanner-3'],
    });
    fireEvent.click(domGetByText(tableRows[0], 'Load'));
    await screen.findByText('Loading');
    await waitFor(() => {
      expect(backend.addCastVoteRecordFile).toHaveBeenCalledTimes(1);
      expect(window.kiosk!.readFile).toHaveBeenCalledTimes(1);
      getByText('0 new CVRs Loaded');
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.CvrLoaded,
        'election_manager',
        expect.objectContaining({ disposition: 'success' })
      );
    });
  });

  test('Load CVR files screen locks to test mode when test files have been loaded', async () => {
    const closeFn = jest.fn();
    const logger = fakeLogger();
    const fileEntries = [
      {
        name: LIVE_FILE1,
        type: 1,
        path: 'live1',
      },
      {
        name: TEST_FILE1,
        type: 1,
        path: 'test1',
      },
      {
        name: TEST_FILE2,
        type: 1,
        path: 'test2',
      },
    ];
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(fileEntries);
    const cvr: CastVoteRecord = {
      _ballotId: unsafeParse(BallotIdSchema, 'abc'),
      _ballotStyleId: '5',
      _ballotType: 'standard',
      _precinctId: '6522',
      _testBallot: true,
      _scannerId: 'abc',
      _batchId: 'batch-1',
      _batchLabel: 'Batch 1',
    };
    const mockFiles = CastVoteRecordFiles.empty;
    const added = await mockFiles.addAll(
      [new File([JSON.stringify(cvr)], TEST_FILE1)],
      eitherNeitherElectionDefinition.election
    );

    window.kiosk!.readFile = jest.fn().mockImplementation((path) => {
      if (path === 'live1') {
        return JSON.stringify({
          ...cvr,
          _testBallot: false,
        });
      }
      return JSON.stringify(cvr);
    });
    const backend = new ElectionManagerStoreMemoryBackend({
      electionDefinition: eitherNeitherElectionDefinition,
      castVoteRecordFiles: added,
    });
    const { getByText, getAllByTestId, getByTestId } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDrive: mockUsbDrive('mounted'),
        logger,
        backend,
      }
    );
    await waitFor(() =>
      expect(getByTestId('modal-title')).toHaveTextContent(
        'Load Test Mode CVR Files'
      )
    );

    const tableRows = getAllByTestId('table-row');
    expect(tableRows).toHaveLength(2);
    domGetByText(tableRows[0], '12/09/2020 03:49:32 PM');
    domGetByText(tableRows[0], '0001');
    expect(
      domGetByText(tableRows[0], 'Loaded').closest('button')!.disabled
    ).toBe(true);
    expect(domGetByTestId(tableRows[0], 'cvr-count')).toHaveTextContent('0');
    domGetByText(tableRows[1], '12/07/2020 03:49:32 PM');
    domGetByText(tableRows[1], '0003');
    expect(domGetByTestId(tableRows[1], 'cvr-count')).toHaveTextContent('5');
    expect(domGetByText(tableRows[1], 'Load').closest('button')!.disabled).toBe(
      false
    );

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    jest.spyOn(backend, 'addCastVoteRecordFile').mockResolvedValueOnce({
      wasExistingFile: true,
      newlyAdded: 0,
      alreadyPresent: 0,
      exportedTimestamp: new Date().toISOString(),
      fileMode: Admin.CvrFileMode.Test,
      fileName: 'cvrs.jsonl',
      id: 'cvr-file-1',
      scannerIds: ['scanner-2', 'scanner-3'],
    });
    fireEvent.click(domGetByText(tableRows[1], 'Load'));
    await screen.findByText('Loading');
    await waitFor(() => {
      expect(backend.addCastVoteRecordFile).toHaveBeenCalledTimes(1);
      // There should be a message about loading a duplicate file displayed.
      getByText('Duplicate File');
      getByText(
        'The selected file was ignored as a duplicate of a previously loaded file.'
      );
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.CvrLoaded,
        'election_manager',
        expect.objectContaining({ disposition: 'failure' })
      );
    });
  });

  test('Load CVR files screen locks to live mode when live files have been loaded', async () => {
    const closeFn = jest.fn();
    const fileEntries = [
      {
        name: LIVE_FILE1,
        type: 1,
        path: 'live1',
      },
      {
        name: TEST_FILE1,
        type: 1,
        path: 'test1',
      },
      {
        name: TEST_FILE2,
        type: 1,
        path: 'test2',
      },
    ];
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(fileEntries);
    const cvr: CastVoteRecord = {
      _ballotId: unsafeParse(BallotIdSchema, 'abc'),
      _ballotStyleId: '5',
      _ballotType: 'standard',
      _precinctId: '6522',
      _testBallot: false,
      _scannerId: '0002',
      _batchId: 'batch-1',
      _batchLabel: 'Batch 1',
    };

    const mockFiles = CastVoteRecordFiles.empty;

    // Add initial "live" CVR file to lock the file mode:
    const added = await mockFiles.addAll(
      [new File([JSON.stringify(cvr)], 'randomname')],
      eitherNeitherElectionDefinition.election
    );

    window.kiosk!.readFile = jest.fn().mockImplementation((path) =>
      JSON.stringify({
        ...cvr,
        _testBallot: path !== 'live1',
      })
    );

    const backend = new ElectionManagerStoreMemoryBackend({
      electionDefinition: eitherNeitherElectionDefinition,
      castVoteRecordFiles: added,
    });
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDrive: mockUsbDrive('mounted'),
        backend,
      }
    );
    await screen.findByText('Load Live Mode CVR Files');

    const tableRows = getAllByTestId('table-row');
    expect(tableRows).toHaveLength(1);
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM');
    domGetByText(tableRows[0], cvr._scannerId);
    jest.spyOn(backend, 'addCastVoteRecordFile').mockResolvedValueOnce({
      wasExistingFile: false,
      newlyAdded: 0,
      alreadyPresent: 0,
      exportedTimestamp: new Date().toISOString(),
      fileMode: Admin.CvrFileMode.Test,
      fileName: 'cvrs.jsonl',
      id: 'cvr-file-1',
      scannerIds: ['scanner-2', 'scanner-3'],
    });
    expect(domGetByText(tableRows[0], 'Load').closest('button')!.disabled).toBe(
      false
    );

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    fireEvent.click(domGetByText(tableRows[0], 'Load'));
    await screen.findByText('Loading');
    await waitFor(() => {
      expect(backend.addCastVoteRecordFile).toHaveBeenCalledTimes(1);
      getByText('0 new CVRs Loaded');
    });
  });

  test('Shows previously loaded files when all files have already been loaded', async () => {
    const closeFn = jest.fn();
    const fileEntries = [
      {
        name: LIVE_FILE1,
        type: 1,
        path: 'live1',
      },
    ];
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(fileEntries);
    const cvr: CastVoteRecord = {
      _ballotId: unsafeParse(BallotIdSchema, 'abc'),
      _ballotStyleId: '5',
      _ballotType: 'standard',
      _precinctId: '6522',
      _testBallot: false,
      _scannerId: 'abc',
      _batchId: 'batch-1',
      _batchLabel: 'Batch 1',
    };
    const mockFiles = CastVoteRecordFiles.empty;
    const added = await mockFiles.addAll(
      [new File([JSON.stringify(cvr)], LIVE_FILE1)],
      eitherNeitherElectionDefinition.election
    );
    const backend = new ElectionManagerStoreMemoryBackend({
      electionDefinition: eitherNeitherElectionDefinition,
      castVoteRecordFiles: added,
    });
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDrive: mockUsbDrive('mounted'),
        backend,
      }
    );
    await screen.findByText('Load Live Mode CVR Files');
    getByText(
      /There were no new Live Mode CVR files automatically found on this USB drive./
    );

    const tableRows = getAllByTestId('table-row');
    expect(tableRows).toHaveLength(1);
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM');
    domGetByText(tableRows[0], '0002');
    expect(
      domGetByText(tableRows[0], 'Loaded').closest('button')!.disabled
    ).toBe(true);

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);
  });
});
