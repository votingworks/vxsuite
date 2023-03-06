import React from 'react';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';

import { Admin } from '@votingworks/api';
import {
  BallotIdSchema,
  CastVoteRecord,
  unsafeParse,
} from '@votingworks/types';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { ElectronFile, UsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { ok } from '@votingworks/basics';
import {
  waitFor,
  fireEvent,
  getByText as domGetByText,
  getByTestId as domGetByTestId,
  screen,
} from '../../test/react_testing_library';
import { ImportCvrFilesModal } from './import_cvrfiles_modal';
import { renderInAppContext } from '../../test/render_in_app_context';
import { mockUsbDrive } from '../../test/helpers/mock_usb_drive';
import {
  createMockApiClient,
  MockApiClient,
} from '../../test/helpers/api_mock';
import { mockCastVoteRecordFileRecord } from '../../test/api_mock_data';

const TEST_FILE1 = 'TEST__machine_0001__10_ballots__2020-12-09_15-49-32.jsonl';
const TEST_FILE2 = 'TEST__machine_0003__5_ballots__2020-12-07_15-49-32.jsonl';
const LIVE_FILE1 = 'machine_0002__10_ballots__2020-12-09_15-59-32.jsonl';

const mockCastVoteRecordImportInfo: Admin.CvrFileImportInfo = {
  wasExistingFile: false,
  newlyAdded: 0,
  alreadyPresent: 0,
  exportedTimestamp: new Date().toISOString(),
  fileMode: Admin.CvrFileMode.Test,
  fileName: 'cvrs.jsonl',
  id: 'cvr-file-1',
  scannerIds: ['scanner-2', 'scanner-3'],
};

const mockFileEntries = [
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

let mockApiClient: MockApiClient;

beforeEach(() => {
  mockApiClient = createMockApiClient();
});

afterEach(() => {
  mockApiClient.assertComplete();
});

test('when USB is not present or valid', async () => {
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected', 'bad_format'];

  for (const usbStatus of usbStatuses) {
    const closeFn = jest.fn();
    mockApiClient.getCastVoteRecordFileMode
      .expectCallWith()
      .resolves(Admin.CvrFileMode.Unlocked);
    mockApiClient.getCastVoteRecordFiles.expectCallWith().resolves([]);
    const { unmount } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDrive: mockUsbDrive(usbStatus),
        apiClient: mockApiClient,
      }
    );
    await screen.findByText('No USB Drive Detected');

    userEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);
    unmount();
  }
});

test('when USB is mounting or ejecting', async () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const usbStatus of usbStatuses) {
    mockApiClient.getCastVoteRecordFileMode
      .expectCallWith()
      .resolves(Admin.CvrFileMode.Unlocked);
    mockApiClient.getCastVoteRecordFiles.expectCallWith().resolves([]);
    const closeFn = jest.fn();
    const { unmount } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDrive: mockUsbDrive(usbStatus),
        apiClient: mockApiClient,
      }
    );
    // screen is initially loading due to waiting on queries
    screen.getByText('Loading');
    await waitFor(() => {
      mockApiClient.assertComplete();
    });
    // screen is still loading after queries complete
    await screen.findByText('Loading');
    unmount();
  }
});

describe('when USB is properly mounted', () => {
  beforeEach(() => {
    const mockKiosk = fakeKiosk();
    mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
    window.kiosk = mockKiosk;
  });

  afterEach(() => {
    delete window.kiosk;
  });

  test('no files found screen & manual load', async () => {
    const closeFn = jest.fn();
    const logger = fakeLogger();
    mockApiClient.getCastVoteRecordFileMode
      .expectCallWith()
      .resolves(Admin.CvrFileMode.Unlocked);
    mockApiClient.getCastVoteRecordFiles.expectCallWith().resolves([]);

    renderInAppContext(<ImportCvrFilesModal onClose={closeFn} />, {
      usbDrive: mockUsbDrive('mounted'),
      logger,
      apiClient: mockApiClient,
    });
    await waitFor(() =>
      screen.getByText(
        /There were no new CVR files automatically found on this USB drive/
      )
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.CvrFilesReadFromUsb,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    );

    userEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    mockApiClient.addCastVoteRecordFile
      .expectCallWith({ path: '/tmp/cast-vote-record.jsonl' })
      .resolves(ok(mockCastVoteRecordImportInfo));

    // You can still manually load files
    const file: ElectronFile = {
      ...new File([''], 'cast-vote-record.jsonl'),
      path: '/tmp/cast-vote-record.jsonl',
    };
    fireEvent.change(screen.getByTestId('manual-input'), {
      target: { files: [file] },
    });

    // modal refetches after adding cast vote record
    mockApiClient.getCastVoteRecordFileMode
      .expectCallWith()
      .resolves(Admin.CvrFileMode.Test);
    mockApiClient.getCastVoteRecordFiles.expectCallWith().resolves([]);

    await screen.findByText('0 new CVRs Loaded');
  });

  test('shows table with both test and live CVR files & allows loading', async () => {
    const closeFn = jest.fn();
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(mockFileEntries);
    const logger = fakeLogger();
    mockApiClient.getCastVoteRecordFileMode
      .expectCallWith()
      .resolves(Admin.CvrFileMode.Unlocked);
    mockApiClient.getCastVoteRecordFiles.expectCallWith().resolves([]);

    renderInAppContext(<ImportCvrFilesModal onClose={closeFn} />, {
      usbDrive: mockUsbDrive('mounted'),
      logger,
      apiClient: mockApiClient,
    });
    await screen.findByText('Load CVR Files');
    screen.getByText(
      /The following CVR files were automatically found on this USB drive./
    );

    const tableRows = screen.getAllByTestId('table-row');
    expect(tableRows).toHaveLength(3);
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM');
    domGetByText(tableRows[0], '0002');
    expect(
      domGetByText(tableRows[0], 'Load').closest('button')!.disabled
    ).toEqual(false);
    domGetByText(tableRows[1], '12/09/2020 03:49:32 PM');
    domGetByText(tableRows[1], '0001');
    expect(
      domGetByText(tableRows[1], 'Load').closest('button')!.disabled
    ).toEqual(false);
    domGetByText(tableRows[2], '12/07/2020 03:49:32 PM');
    domGetByText(tableRows[2], '0003');
    expect(
      domGetByText(tableRows[2], 'Load').closest('button')!.disabled
    ).toEqual(false);
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.CvrFilesReadFromUsb,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    );

    userEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    mockApiClient.addCastVoteRecordFile
      .expectCallWith({ path: 'live1' })
      .resolves(ok(mockCastVoteRecordImportInfo));
    mockApiClient.getCastVoteRecordFileMode
      .expectCallWith()
      .resolves(Admin.CvrFileMode.Official);
    mockApiClient.getCastVoteRecordFiles.expectCallWith().resolves([]);

    userEvent.click(domGetByText(tableRows[0], 'Load'));
    await screen.findByText('Loading');
    await screen.findByText('0 new CVRs Loaded');
  });

  test('locks to test mode when in test mode & shows previously loaded files as loaded', async () => {
    const closeFn = jest.fn();
    const logger = fakeLogger();
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(mockFileEntries);
    mockApiClient.getCastVoteRecordFileMode
      .expectCallWith()
      .resolves(Admin.CvrFileMode.Test);
    mockApiClient.getCastVoteRecordFiles
      .expectCallWith()
      .resolves([{ ...mockCastVoteRecordFileRecord, filename: TEST_FILE1 }]);

    renderInAppContext(<ImportCvrFilesModal onClose={closeFn} />, {
      usbDrive: mockUsbDrive('mounted'),
      logger,
      apiClient: mockApiClient,
    });
    await waitFor(() => {
      expect(screen.getByTestId('modal-title')).toHaveTextContent(
        'Load Test Ballot Mode CVR Files'
      );
    });

    const tableRows = screen.getAllByTestId('table-row');
    expect(tableRows).toHaveLength(2);
    domGetByText(tableRows[0], '12/09/2020 03:49:32 PM');
    domGetByText(tableRows[0], '0001');
    expect(
      domGetByText(tableRows[0], 'Loaded').closest('button')!.disabled
    ).toEqual(true);
    expect(domGetByTestId(tableRows[0], 'cvr-count')).toHaveTextContent('0');
    domGetByText(tableRows[1], '12/07/2020 03:49:32 PM');
    domGetByText(tableRows[1], '0003');
    expect(domGetByTestId(tableRows[1], 'cvr-count')).toHaveTextContent('5');
    expect(
      domGetByText(tableRows[1], 'Load').closest('button')!.disabled
    ).toEqual(false);

    userEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);
  });

  test('locks to live mode when live files have been loaded', async () => {
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(mockFileEntries);
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

    mockApiClient.getCastVoteRecordFileMode
      .expectCallWith()
      .resolves(Admin.CvrFileMode.Official);
    mockApiClient.getCastVoteRecordFiles
      .expectCallWith()
      .resolves([{ ...mockCastVoteRecordFileRecord, filename: 'random' }]);
    renderInAppContext(<ImportCvrFilesModal onClose={jest.fn()} />, {
      usbDrive: mockUsbDrive('mounted'),
      apiClient: mockApiClient,
    });
    await screen.findByText('Load Official Ballot Mode CVR Files');

    const tableRows = screen.getAllByTestId('table-row');
    expect(tableRows).toHaveLength(1);
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM');
    domGetByText(tableRows[0], cvr._scannerId);
    expect(
      domGetByText(tableRows[0], 'Load').closest('button')!.disabled
    ).toEqual(false);
  });
});
