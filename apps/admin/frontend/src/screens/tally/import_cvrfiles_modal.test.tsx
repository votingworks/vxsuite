import { mockKiosk, mockOf } from '@votingworks/test-utils';

import { mockUsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { ok } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import {
  waitFor,
  getByText as domGetByText,
  getByTestId as domGetByTestId,
  screen,
} from '../../../test/react_testing_library';
import { ImportCvrFilesModal } from './import_cvrfiles_modal';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import {
  mockCastVoteRecordFileMetadata,
  mockCastVoteRecordFileRecord,
  mockCastVoteRecordImportInfo,
} from '../../../test/api_mock_data';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('when USB is not present or valid', async () => {
  const usbStatuses: Array<UsbDriveStatus['status']> = [
    'no_drive',
    'ejected',
    'error',
  ];

  for (const usbStatus of usbStatuses) {
    const closeFn = jest.fn();
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    apiMock.expectGetCastVoteRecordFiles([]);
    apiMock.expectListCastVoteRecordFilesOnUsb([]);
    const { unmount } = renderInAppContext(
      <ImportCvrFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: mockUsbDriveStatus(usbStatus),
        apiMock,
      }
    );
    await screen.findByText('No USB Drive Detected');

    userEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);
    unmount();
  }
});

describe('when USB is properly mounted', () => {
  test('no files found screen & manual load', async () => {
    window.kiosk = mockKiosk();
    const closeFn = jest.fn();
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    apiMock.expectGetCastVoteRecordFiles([]);
    apiMock.expectListCastVoteRecordFilesOnUsb([]);

    renderInAppContext(<ImportCvrFilesModal onClose={closeFn} />, {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      apiMock,
    });
    await waitFor(() =>
      screen.getByText(
        /No new CVR exports were automatically found on the USB drive./
      )
    );

    userEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);

    apiMock.apiClient.addCastVoteRecordFile
      .expectCallWith({ path: '/tmp/cast-vote-record.jsonl' })
      .resolves(ok(mockCastVoteRecordImportInfo));

    // You can still manually load files
    mockOf(window.kiosk.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/cast-vote-record.jsonl'],
    });
    userEvent.click(screen.getByTestId('manual-input'));

    // modal refetches after adding cast vote record
    apiMock.expectGetCastVoteRecordFileMode('test');
    apiMock.expectGetCastVoteRecordFiles([]);

    await screen.findByText('1,000 New CVRs Loaded');

    delete window.kiosk;
  });

  test('shows table with both test and live CVR files & allows loading', async () => {
    const closeFn = jest.fn();
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    apiMock.expectGetCastVoteRecordFiles([]);
    apiMock.expectListCastVoteRecordFilesOnUsb(mockCastVoteRecordFileMetadata);

    renderInAppContext(<ImportCvrFilesModal onClose={closeFn} />, {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      apiMock,
    });
    await screen.findByText('Load CVRs');
    screen.getByText(
      /The following CVR exports were automatically found on the USB drive:/
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
    await screen.findByText('Loading CVRs');
    await screen.findByText('1,000 New CVRs Loaded');
  });

  test('locks to test mode when in test mode & shows previously loaded files as loaded', async () => {
    const closeFn = jest.fn();
    apiMock.expectGetCastVoteRecordFileMode('test');
    const [, testFile1, testFile2] = mockCastVoteRecordFileMetadata;
    apiMock.expectGetCastVoteRecordFiles([
      {
        ...mockCastVoteRecordFileRecord,
        filename: testFile1.name,
        exportTimestamp: testFile1.exportTimestamp.toISOString(),
      },
      {
        ...mockCastVoteRecordFileRecord,
        filename: testFile2.name,
      },
    ]);
    apiMock.expectListCastVoteRecordFilesOnUsb(mockCastVoteRecordFileMetadata);
    renderInAppContext(<ImportCvrFilesModal onClose={closeFn} />, {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      apiMock,
    });
    await screen.findByRole('heading', {
      name: 'Load Test Ballot CVRs',
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
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      apiMock,
    });
    await screen.findByText('Load Official Ballot CVRs');

    const tableRows = screen.getAllByTestId('table-row');
    expect(tableRows).toHaveLength(1);
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM');
    domGetByText(tableRows[0], '0002');
    expect(
      domGetByText(tableRows[0], 'Load').closest('button')!.disabled
    ).toEqual(false);
  });
});
