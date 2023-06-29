import { fakeKiosk } from '@votingworks/test-utils';

import { ElectronFile, UsbDriveStatus, mockUsbDrive } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { ok } from '@votingworks/basics';
import type {
  CastVoteRecordFileMetadata,
  CvrFileImportInfo,
} from '@votingworks/admin-backend';
import {
  waitFor,
  fireEvent,
  getByText as domGetByText,
  getByTestId as domGetByTestId,
  screen,
} from '../../test/react_testing_library';
import { ImportCvrFilesModal } from './import_cvrfiles_modal';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';
import { mockCastVoteRecordFileRecord } from '../../test/api_mock_data';

const TEST_FILE1 = 'TEST__machine_0001__10_ballots__2020-12-09_15-49-32.jsonl';
const TEST_FILE2 = 'TEST__machine_0003__5_ballots__2020-12-07_15-49-32.jsonl';
const LIVE_FILE1 = 'machine_0002__10_ballots__2020-12-09_15-59-32.jsonl';

const mockCastVoteRecordImportInfo: CvrFileImportInfo = {
  wasExistingFile: false,
  newlyAdded: 0,
  alreadyPresent: 0,
  exportedTimestamp: new Date().toISOString(),
  fileMode: 'test',
  fileName: 'cvrs.jsonl',
  id: 'cvr-file-1',
};

const mockCastVoteRecordFileMetadata: CastVoteRecordFileMetadata[] = [
  {
    name: LIVE_FILE1,
    path: `/tmp/${LIVE_FILE1}`,
    cvrCount: 10,
    scannerIds: ['0002'],
    exportTimestamp: new Date(2020, 11, 9, 15, 59, 32),
    isTestModeResults: false,
  },
  {
    name: TEST_FILE1,
    path: `/tmp/${TEST_FILE1}`,
    cvrCount: 10,
    scannerIds: ['0001'],
    exportTimestamp: new Date(2020, 11, 9, 15, 49, 32),
    isTestModeResults: true,
  },
  {
    name: TEST_FILE2,
    path: `/tmp/${TEST_FILE2}`,
    cvrCount: 5,
    scannerIds: ['0003'],
    exportTimestamp: new Date(2020, 11, 7, 15, 49, 32),
    isTestModeResults: true,
  },
];

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('when USB is not present or valid', async () => {
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected', 'bad_format'];

  for (const usbStatus of usbStatuses) {
    const closeFn = jest.fn();
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    apiMock.expectGetCastVoteRecordFiles([]);
    apiMock.expectListCastVoteRecordFilesOnUsb([]);
    const { unmount } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDrive: mockUsbDrive(usbStatus),
        apiMock,
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
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    apiMock.expectGetCastVoteRecordFiles([]);
    apiMock.expectListCastVoteRecordFilesOnUsb([]);
    const closeFn = jest.fn();
    const { unmount } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDrive: mockUsbDrive(usbStatus),
        apiMock,
      }
    );
    // screen is initially loading due to waiting on queries
    screen.getByText('Loading');
    await waitFor(() => {
      apiMock.assertComplete();
    });
    // screen is still loading after queries complete
    await screen.findByText('Loading');
    unmount();
  }
});

describe('when USB is properly mounted', () => {
  test('no files found screen & manual load', async () => {
    window.kiosk = fakeKiosk();
    const closeFn = jest.fn();
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    apiMock.expectGetCastVoteRecordFiles([]);
    apiMock.expectListCastVoteRecordFilesOnUsb([]);

    renderInAppContext(<ImportCvrFilesModal onClose={closeFn} />, {
      usbDrive: mockUsbDrive('mounted'),
      apiMock,
    });
    await waitFor(() =>
      screen.getByText(
        /There were no new CVR files automatically found on this USB drive/
      )
    );

    userEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    apiMock.apiClient.addCastVoteRecordFile
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
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetCastVoteRecordFiles([]);

    await screen.findByText('0 new CVRs Loaded');

    delete window.kiosk;
  });

  test('shows table with both test and live CVR files & allows loading', async () => {
    const closeFn = jest.fn();
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    apiMock.expectGetCastVoteRecordFiles([]);
    apiMock.expectListCastVoteRecordFilesOnUsb(mockCastVoteRecordFileMetadata);

    renderInAppContext(<ImportCvrFilesModal onClose={closeFn} />, {
      usbDrive: mockUsbDrive('mounted'),
      apiMock,
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

    userEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    apiMock.apiClient.addCastVoteRecordFile
      .expectCallWith({
        path: '/tmp/machine_0002__10_ballots__2020-12-09_15-59-32.jsonl',
      })
      .resolves(ok(mockCastVoteRecordImportInfo));
    apiMock.expectGetCastVoteRecordFileMode('official');
    apiMock.expectGetCastVoteRecordFiles([]);

    userEvent.click(domGetByText(tableRows[0], 'Load'));
    await screen.findByText('Loading');
    await screen.findByText('0 new CVRs Loaded');
  });

  test('locks to test mode when in test mode & shows previously loaded files as loaded', async () => {
    const closeFn = jest.fn();
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetCastVoteRecordFiles([
      { ...mockCastVoteRecordFileRecord, filename: TEST_FILE1 },
    ]);
    apiMock.expectListCastVoteRecordFilesOnUsb(mockCastVoteRecordFileMetadata);
    renderInAppContext(<ImportCvrFilesModal onClose={closeFn} />, {
      usbDrive: mockUsbDrive('mounted'),
      apiMock,
    });
    await screen.findByRole('heading', {
      name: 'Load Test Ballot Mode CVR Files',
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
    apiMock.expectGetCastVoteRecordFileMode('official');
    apiMock.expectGetCastVoteRecordFiles([
      { ...mockCastVoteRecordFileRecord, filename: 'random' },
    ]);
    apiMock.expectListCastVoteRecordFilesOnUsb(mockCastVoteRecordFileMetadata);
    renderInAppContext(<ImportCvrFilesModal onClose={jest.fn()} />, {
      usbDrive: mockUsbDrive('mounted'),
      apiMock,
    });
    await screen.findByText('Load Official Ballot Mode CVR Files');

    const tableRows = screen.getAllByTestId('table-row');
    expect(tableRows).toHaveLength(1);
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM');
    domGetByText(tableRows[0], '0002');
    expect(
      domGetByText(tableRows[0], 'Load').closest('button')!.disabled
    ).toEqual(false);
  });
});
