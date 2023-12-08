import { fakeLogger } from '@votingworks/logging';
import userEvent from '@testing-library/user-event';
import { err } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { screen, waitFor, within } from '../../test/react_testing_library';
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
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
  });

  screen.getButton('Save Election Package');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
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
    renderInAppContext(<ExportElectionPackageModalButton />, {
      usbDriveStatus: mockUsbDriveStatus(usbStatus),
      apiMock,
    });
    userEvent.click(screen.getButton('Save Election Package'));
    await waitFor(() => screen.getByText('No USB Drive Detected'));
    screen.getByText(
      'Please insert a USB drive in order to save the election package.'
    );

    userEvent.click(screen.getButton('Cancel'));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
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
  within(modal).getByText(
    /A zip archive will automatically be saved to the default location on the mounted USB drive./
  );

  apiMock.expectSaveElectionPackageToUsb();
  const saveButton = within(modal).getButton('Save');
  userEvent.click(saveButton);
  await waitFor(() => expect(saveButton).toBeDisabled());
  await within(modal).findByText('Election Package Saved');

  userEvent.click(within(modal).getButton('Close'));
  expect(screen.queryAllByTestId('modal')).toHaveLength(0);
});

test('Modal renders error message appropriately', async () => {
  const logger = fakeLogger();
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
    logger,
  });
  userEvent.click(screen.getButton('Save Election Package'));
  await screen.findByRole('heading', { name: 'Save Election Package' });

  apiMock.expectSaveElectionPackageToUsb(
    err({ type: 'missing-usb-drive', message: '' })
  );
  userEvent.click(screen.getButton('Save'));

  await screen.findByRole('heading', {
    name: 'Failed to Save Election Package',
  });
  screen.getByText(/An error occurred: No USB drive detected/);

  userEvent.click(screen.getButton('Close'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('Modal renders renders loading message while rendering ballots appropriately', async () => {
  renderInAppContext(<ExportElectionPackageModalButton />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });
  userEvent.click(screen.getButton('Save Election Package'));
  await screen.findByRole('heading', { name: 'Save Election Package' });

  apiMock.expectSaveElectionPackageToUsb();
  userEvent.click(screen.getButton('Save'));

  await screen.findByText('Election Package Saved');

  screen.getByText(
    'You may now eject the USB drive. Use the saved election package on this USB drive to configure VxSuite components.'
  );

  apiMock.expectEjectUsbDrive();
  userEvent.click(screen.getButton('Eject USB'));

  userEvent.click(screen.getButton('Close'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
