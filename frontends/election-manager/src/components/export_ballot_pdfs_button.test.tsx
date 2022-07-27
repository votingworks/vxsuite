import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { assert, usbstick } from '@votingworks/utils';
import React from 'react';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ExportBallotPdfsButton } from './export_ballot_pdfs_button';

const { UsbDriveStatus } = usbstick;

jest.mock('../components/hand_marked_paper_ballot');

beforeEach(() => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);
  const fileWriter = fakeFileWriter();
  mockKiosk.saveAs = jest.fn().mockResolvedValue(fileWriter);
  mockKiosk.writeFile = jest.fn().mockResolvedValue(fileWriter);
  window.kiosk = mockKiosk;
});

afterEach(() => {
  delete window.kiosk;
});

test('button renders properly when not clicked', () => {
  renderInAppContext(<ExportBallotPdfsButton />);

  expect(screen.queryByText('Export Ballot PDFs')).toHaveProperty(
    'type',
    'button'
  );
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('modal renders insert usb screen appropriately', async () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.recentlyEjected,
    UsbDriveStatus.notavailable,
  ];

  for (const usbStatus of usbStatuses) {
    const { unmount } = renderInAppContext(<ExportBallotPdfsButton />, {
      usbDriveStatus: usbStatus,
    });
    userEvent.click(screen.getByText('Export Ballot PDFs'));

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByText('No USB Drive Detected');
    within(modal).getByAltText('Insert USB Image');
    userEvent.click(within(modal).getByText('Cancel'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    unmount();
  }
});

test('modal renders loading screen when usb drive is mounting or ejecting', async () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting];

  for (const usbStatus of usbStatuses) {
    const { unmount } = renderInAppContext(<ExportBallotPdfsButton />, {
      usbDriveStatus: usbStatus,
    });
    userEvent.click(screen.getByText('Export Ballot PDFs'));
    const modal = await screen.findByRole('alertdialog');
    within(modal).getByText('Loading');

    unmount();
  }
});

test('modal happy path flow works', async () => {
  const logger = fakeLogger();
  const ejectFunction = jest.fn();
  renderInAppContext(<ExportBallotPdfsButton />, {
    logger,
    usbDriveStatus: UsbDriveStatus.mounted,
    usbDriveEject: ejectFunction,
  });

  userEvent.click(screen.getByText('Export Ballot PDFs'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(within(modal).getByText('Export'));
  await within(modal).findByText('Generating Ballot PDFs…');
  await within(modal).findByText('Finishing Export…');
  await within(modal).findByText('Export Complete');

  assert(window.kiosk);
  expect(window.kiosk.makeDirectory).toHaveBeenCalledTimes(1);
  expect(window.kiosk.writeFile).toHaveBeenCalledTimes(1);
  expect(window.kiosk.writeFile).toHaveBeenCalledWith(
    'fake mount point/ballot-pdfs/ballot-pdfs-election-b1e83122e8-live.zip'
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'admin',
    expect.objectContaining({ disposition: 'success' })
  );

  expect(modal).toBeInTheDocument();
  userEvent.click(within(modal).getByText('Eject USB'));
  expect(ejectFunction).toHaveBeenCalledTimes(1);
  userEvent.click(within(modal).getByText('Close'));
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('can select options to export different ballots', async () => {
  renderInAppContext(<ExportBallotPdfsButton />, {
    usbDriveStatus: UsbDriveStatus.mounted,
  });

  userEvent.click(screen.getByText('Export Ballot PDFs'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(within(modal).getByText('Absentee'));
  userEvent.click(within(modal).getByText('Sample'));
  userEvent.click(within(modal).getByText('Export'));
  await within(modal).findByText('Export Complete');

  expect(window.kiosk!.writeFile).toHaveBeenCalledWith(
    'fake mount point/ballot-pdfs/ballot-pdfs-election-b1e83122e8-sample-absentee.zip'
  );
});

test('modal custom flow works', async () => {
  const logger = fakeLogger();
  renderInAppContext(<ExportBallotPdfsButton />, {
    usbDriveStatus: UsbDriveStatus.mounted,
    logger,
  });
  userEvent.click(screen.getByText('Export Ballot PDFs'));
  const modal = await screen.findByRole('alertdialog');

  userEvent.click(within(modal).getByText('Custom'));
  await within(modal).findByText('Export Complete');
  expect(window.kiosk!.saveAs).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'admin',
    expect.objectContaining({ disposition: 'success' })
  );
});

test('modal renders error message appropriately', async () => {
  // Trigger error by simulating no file chosen at "Save As" prompt
  window.kiosk!.saveAs = jest.fn().mockResolvedValue(undefined);
  renderInAppContext(<ExportBallotPdfsButton />, {
    usbDriveStatus: UsbDriveStatus.mounted,
  });
  userEvent.click(screen.getByText('Export Ballot PDFs'));
  const modal = await screen.findByRole('alertdialog');

  userEvent.click(within(modal).getByText('Custom'));

  await within(modal).findByText('Export Failed');
  expect(modal).toBeInTheDocument();
  within(modal).getByText(/An error occurred:/);
  within(modal).getByText(/could not begin download; no file was chosen/);
});
