import React from 'react';
import {
  waitFor,
  fireEvent,
  getByText as domGetByText,
  getByTestId as domGetByTestId,
} from '@testing-library/react';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';

import { usbstick } from '@votingworks/utils';
import {
  BallotIdSchema,
  CastVoteRecord,
  unsafeParse,
} from '@votingworks/types';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import fetchMock from 'fetch-mock';
import { sha256 } from 'js-sha256';
import { ImportCvrFilesModal } from './import_cvrfiles_modal';
import { renderInAppContext } from '../../test/render_in_app_context';

const TEST_FILE1 = 'TEST__machine_0001__10_ballots__2020-12-09_15-49-32.jsonl';
const TEST_FILE2 = 'TEST__machine_0003__5_ballots__2020-12-07_15-49-32.jsonl';
const LIVE_FILE1 = 'machine_0002__10_ballots__2020-12-09_15-59-32.jsonl';

const { UsbDriveStatus } = usbstick;

test('No USB screen shows when there is no USB drive', () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.recentlyEjected,
    UsbDriveStatus.notavailable,
  ];

  for (const usbStatus of usbStatuses) {
    const closeFn = jest.fn();
    const { unmount, getByText } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      { usbDriveStatus: usbStatus }
    );
    getByText('No USB Drive Detected');

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);
    unmount();
  }
});

test('Loading screen show while usb is mounting or ejecting', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting];

  for (const usbStatus of usbStatuses) {
    const closeFn = jest.fn();
    const { unmount, getByText } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      { usbDriveStatus: usbStatus }
    );
    getByText('Loading');
    unmount();
  }
});

describe('Screens display properly when USB is mounted', () => {
  beforeEach(() => {
    const mockKiosk = fakeKiosk();
    mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
    window.kiosk = mockKiosk;
    fetchMock.reset();
  });

  afterEach(() => {
    delete window.kiosk;
  });

  test('No files found screen shows when mounted usb has no valid files', async () => {
    const closeFn = jest.fn();
    const logger = fakeLogger();
    fetchMock.postOnce('/admin/write-ins/cvrs', {
      importedCvrCount: 0,
      duplicateCvrCount: 0,
      isTestMode: false,
    });
    const { getByText, getByTestId } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        logger,
      }
    );
    await waitFor(() =>
      getByText(
        /There were no new CVR files automatically found on this USB drive/
      )
    );

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    // You can still manually load files
    fireEvent.change(getByTestId('manual-input'), {
      target: { files: [new File([''], 'file.jsonl')] },
    });
    await waitFor(() => getByText('0 new CVRs Imported'));
    expect(fetchMock.called('/admin/write-ins/cvrs')).toBe(true);
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
    fetchMock.postOnce('/admin/write-ins/cvrs', {
      importedCvrCount: 0,
      duplicateCvrCount: 0,
      isTestMode: false,
    });
    const logger = fakeLogger();
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        logger,
      }
    );
    await waitFor(() => getByText('Load CVR Files'));
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
    expect(window.kiosk!.readFile).toHaveBeenCalledTimes(3); // The files should have been read.
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.CvrFilesReadFromUsb,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    );

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    fireEvent.click(domGetByText(tableRows[0], 'Load'));
    getByText('Loading');
    await waitFor(() => {
      // We should not need to read the file another time since it was already read.
      expect(window.kiosk!.readFile).toHaveBeenCalledTimes(3);
      getByText('0 new CVRs Imported');
      expect(fetchMock.called('/admin/write-ins/cvrs')).toBe(true);
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.CvrLoaded,
        'election_manager',
        expect.objectContaining({ disposition: 'success' })
      );
    });
  });

  test('Can handle errors appropriately', async () => {
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
    window.kiosk!.readFile = jest
      .fn()
      .mockResolvedValueOnce('invalid-file-contents');
    const { getByText, getByTestId } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        logger,
      }
    );
    await waitFor(() => getByText('Load CVR Files'));
    // If the files can not be parsed properly they are not automatically shown to load.
    getByText(
      /There were no new CVR files automatically found on this USB drive./
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.CvrFilesReadFromUsb,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    );
    expect(window.kiosk!.readFile).toHaveBeenCalledTimes(3); // The files should have been read.

    fireEvent.change(getByTestId('manual-input'), {
      target: { files: [new File(['invalid-file-contents'], 'file.jsonl')] },
    });
    getByText('Loading');
    await waitFor(() => {
      // There should be an error importing the file.
      getByText('Error');
      getByText(/There was an error reading the content of the file/);
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.CvrLoaded,
        'election_manager',
        expect.objectContaining({ disposition: 'failure' })
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

    window.kiosk!.readFile = jest.fn().mockImplementation((path) => {
      if (path === 'live1') {
        return JSON.stringify({
          ...cvr,
          _testBallot: false,
        });
      }
      return JSON.stringify(cvr);
    });
    fetchMock.postOnce('/admin/write-ins/cvrs', {
      importedCvrCount: 1,
      duplicateCvrCount: 0,
      isTestMode: true,
    });
    const { getByText, getAllByTestId, getByTestId } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        castVoteRecordFiles: [
          {
            name: TEST_FILE1,
            importedCvrCount: 1,
            duplicatedCvrCount: 0,
            scannerIds: ['abc'],
            precinctIds: ['6522'],
            exportTimestamp: new Date(2020, 11, 9, 15, 49, 32),
            isTestMode: true,
            signature: sha256(JSON.stringify(cvr)),
            allCastVoteRecords: [cvr],
          },
        ],
        importedBallotIds: new Set(['abc']),
        logger,
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
    domGetByText(tableRows[0], 'abc');
    expect(
      domGetByText(tableRows[0], 'Loaded').closest('button')!.disabled
    ).toBe(true);
    await waitFor(() =>
      expect(domGetByTestId(tableRows[0], 'new-cvr-count')).toHaveTextContent(
        '0'
      )
    );
    expect(
      domGetByTestId(tableRows[0], 'imported-cvr-count')
    ).toHaveTextContent('1');
    domGetByText(tableRows[1], '12/07/2020 03:49:32 PM');
    domGetByText(tableRows[1], 'abc');
    expect(domGetByTestId(tableRows[1], 'new-cvr-count')).toHaveTextContent(
      '0'
    );
    expect(
      domGetByTestId(tableRows[1], 'imported-cvr-count')
    ).toHaveTextContent('1');
    expect(domGetByText(tableRows[1], 'Load').closest('button')!.disabled).toBe(
      false
    );

    expect(window.kiosk!.readFile).toHaveBeenCalledTimes(2);
    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    fireEvent.click(domGetByText(tableRows[1], 'Load'));
    getByText('Loading');
    await waitFor(() => {
      // There should be a message about importing a duplicate file displayed.
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
    fetchMock.postOnce('/admin/write-ins/cvrs', {
      importedCvrCount: 0,
      duplicateCvrCount: 0,
      isTestMode: false,
    });
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
      _scannerId: 'abc',
      _batchId: 'batch-1',
      _batchLabel: 'Batch 1',
    };
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        importedBallotIds: new Set(['abc']),
        castVoteRecordFiles: [
          {
            name: 'randomname',
            importedCvrCount: 1,
            duplicatedCvrCount: 0,
            scannerIds: ['abc'],
            precinctIds: ['6522'],
            exportTimestamp: new Date(),
            isTestMode: false,
            signature: sha256(JSON.stringify(cvr)),
            allCastVoteRecords: [cvr],
          },
        ],
      }
    );
    await waitFor(() => getByText('Load Live Mode CVR Files'));

    const tableRows = getAllByTestId('table-row');
    expect(tableRows).toHaveLength(1);
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM');
    domGetByText(tableRows[0], '0002');
    expect(domGetByText(tableRows[0], 'Load').closest('button')!.disabled).toBe(
      false
    );

    expect(window.kiosk!.readFile).toHaveBeenCalledTimes(3);
    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    fireEvent.click(domGetByText(tableRows[0], 'Load'));
    getByText('Loading');
    await waitFor(() => {
      expect(fetchMock.called('/admin/write-ins/cvrs')).toBe(true);
      getByText('0 new CVRs Imported');
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
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        castVoteRecordFiles: [
          {
            name: LIVE_FILE1,
            importedCvrCount: 1,
            duplicatedCvrCount: 0,
            scannerIds: ['abc'],
            precinctIds: ['6522'],
            exportTimestamp: new Date(2020, 11, 9, 15, 59, 32),
            isTestMode: false,
            signature: sha256(JSON.stringify(cvr)),
            allCastVoteRecords: [cvr],
          },
        ],
      }
    );
    await waitFor(() => getByText('Load Live Mode CVR Files'));
    getByText(
      /There were no new Live Mode CVR files automatically found on this USB drive./
    );

    const tableRows = getAllByTestId('table-row');
    expect(tableRows).toHaveLength(1);
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM');
    domGetByText(tableRows[0], 'abc');
    expect(
      domGetByText(tableRows[0], 'Loaded').closest('button')!.disabled
    ).toBe(true);

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);
  });
});
