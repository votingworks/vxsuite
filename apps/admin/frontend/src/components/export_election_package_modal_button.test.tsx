import { fakeLogger } from '@votingworks/logging';
import userEvent from '@testing-library/user-event';
import { err } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ExportElectionPackageModalButton } from './export_election_package_modal_button';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2023, 0, 1));
  apiMock = createApiMock();
});

afterEach(() => {
  jest.useRealTimers();
  apiMock.assertComplete();
});

test('Button renders properly when not clicked', () => {
  const { queryByTestId } = renderInAppContext(
    <ExportElectionPackageModalButton />,
    {
      apiMock,
    }
  );

  screen.getButton('Save Election Package');
  expect(queryByTestId('modal')).toBeNull();
});

test.each<{
  usbStatus: UsbDriveStatus['status'];
}>([
  { usbStatus: 'no_drive' },
  { usbStatus: 'ejected' },
  { usbStatus: 'error' },
])(
  'Modal renders insert usb screen appropriately for status $usbStatus',
  async ({ usbStatus }) => {
    const { getByText, queryAllByText, queryAllByAltText, queryAllByTestId } =
      renderInAppContext(<ExportElectionPackageModalButton />, {
        usbDriveStatus: mockUsbDriveStatus(usbStatus),
        apiMock,
      });
    fireEvent.click(getByText('Save Election Package'));
    await waitFor(() => getByText('No USB Drive Detected'));
    expect(queryAllByAltText('Insert USB Image')).toHaveLength(1);
    expect(queryAllByTestId('modal')).toHaveLength(1);
    expect(
      queryAllByText(
        'Please insert a USB drive in order to save the ballot configuration.'
      )
    ).toHaveLength(1);

    fireEvent.click(getByText('Cancel'));
    expect(queryAllByTestId('modal')).toHaveLength(0);
  }
);

test('Modal renders export confirmation screen when usb detected and manual link works as expected', async () => {
  const logger = fakeLogger();
  renderInAppContext(<ExportElectionPackageModalButton />, {
    usbDriveStatus: mockUsbDriveStatus('mounted'),
    logger,
    apiMock,
  });
  userEvent.click(
    await screen.findByRole('button', { name: 'Save Election Package' })
  );
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Election Package');
  within(modal).getByAltText('Insert USB Image');
  within(modal).getByText(
    /A zip archive will automatically be saved to the default location on the mounted USB drive./
  );

  apiMock.expectSaveElectionPackageToUsb();
  userEvent.click(within(modal).getButton('Save'));
  await within(modal).findByText('Election Package Saved');

  fireEvent.click(within(modal).getByText('Close'));
  expect(screen.queryAllByTestId('modal')).toHaveLength(0);
});

test('Modal renders error message appropriately', async () => {
  const logger = fakeLogger();
  const { queryAllByTestId, getByText, queryAllByText } = renderInAppContext(
    <ExportElectionPackageModalButton />,
    {
      apiMock,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      logger,
    }
  );
  fireEvent.click(getByText('Save Election Package'));
  await waitFor(() => getByText('Save'));

  apiMock.expectSaveElectionPackageToUsb(
    err({ type: 'missing-usb-drive', message: '' })
  );
  userEvent.click(screen.getButton('Save'));

  await waitFor(() => getByText('Failed to Save Election Package'));
  expect(queryAllByTestId('modal')).toHaveLength(1);
  expect(
    queryAllByText(/An error occurred: No USB drive detected/)
  ).toHaveLength(1);

  fireEvent.click(getByText('Close'));
  expect(queryAllByTestId('modal')).toHaveLength(0);
});

test('Modal renders renders loading message while rendering ballots appropriately', async () => {
  const { queryAllByTestId, getByText, queryByText, getByRole } =
    renderInAppContext(<ExportElectionPackageModalButton />, {
      apiMock,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    });
  fireEvent.click(getByText('Save Election Package'));
  await waitFor(() => getByText('Save'));
  apiMock.expectSaveElectionPackageToUsb();
  userEvent.click(getByRole('button', { name: /Save/ }));

  await screen.findByText('Election Package Saved');

  expect(queryAllByTestId('modal')).toHaveLength(1);
  expect(
    queryByText(
      'You may now eject the USB drive. Use the saved election package on this USB drive to configure VxScan or VxCentralScan.'
    )
  ).toBeInTheDocument();

  apiMock.expectEjectUsbDrive();
  expect(queryByText('Eject USB')).toBeInTheDocument();
  fireEvent.click(getByText('Eject USB'));

  fireEvent.click(getByText('Close'));
  expect(queryAllByTestId('modal')).toHaveLength(0);
});
