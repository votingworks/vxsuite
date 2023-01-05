import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { UsbDriveStatus } from '@votingworks/ui';
import { assert } from '@votingworks/utils';
import React from 'react';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ExportBallotPdfsButton } from './export_ballot_pdfs_button';

jest.mock('../components/hand_marked_paper_ballot');

beforeEach(() => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
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

  expect(screen.queryByText('Save PDFs')).toHaveProperty('type', 'button');
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('modal renders insert usb screen appropriately', async () => {
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected'];

  for (const usbStatus of usbStatuses) {
    const { unmount } = renderInAppContext(<ExportBallotPdfsButton />, {
      usbDriveStatus: usbStatus,
    });
    userEvent.click(screen.getByText('Save PDFs'));

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByText('No USB Drive Detected');
    within(modal).getByAltText('Insert USB Image');
    userEvent.click(within(modal).getByText('Cancel'));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    unmount();
  }
});

test('modal renders loading screen when usb drive is mounting or ejecting', async () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const usbStatus of usbStatuses) {
    const { unmount } = renderInAppContext(<ExportBallotPdfsButton />, {
      usbDriveStatus: usbStatus,
    });
    userEvent.click(screen.getByText('Save PDFs'));
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
    usbDriveStatus: 'mounted',
    usbDriveEject: ejectFunction,
  });

  userEvent.click(screen.getByText('Save PDFs'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(within(modal).getByText('Save'));
  await within(modal).findByText('Generating Ballot PDFs…');
  await within(modal).findByText('Saving…');
  await within(modal).findByText('Ballot PDFs Saved');

  assert(window.kiosk);
  expect(window.kiosk.makeDirectory).toHaveBeenCalledTimes(1);
  expect(window.kiosk.writeFile).toHaveBeenCalledTimes(1);
  expect(window.kiosk.writeFile).toHaveBeenCalledWith(
    'fake mount point/ballot-pdfs/ballot-pdfs-election-b1e83122e8-live.zip'
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({ disposition: 'success' })
  );

  expect(modal).toBeInTheDocument();
  userEvent.click(within(modal).getByText('Eject USB'));
  expect(ejectFunction).toHaveBeenCalledTimes(1);
  userEvent.click(within(modal).getByText('Close'));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});

test('can select options to save different ballots', async () => {
  renderInAppContext(<ExportBallotPdfsButton />, {
    usbDriveStatus: 'mounted',
  });

  userEvent.click(screen.getByText('Save PDFs'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(within(modal).getByText('Absentee'));
  userEvent.click(within(modal).getByText('Sample'));
  userEvent.click(within(modal).getByText('Save'));
  await within(modal).findByText('Ballot PDFs Saved');

  expect(window.kiosk!.writeFile).toHaveBeenCalledWith(
    'fake mount point/ballot-pdfs/ballot-pdfs-election-b1e83122e8-sample-absentee.zip'
  );
});

test('modal custom flow works', async () => {
  const logger = fakeLogger();
  renderInAppContext(<ExportBallotPdfsButton />, {
    usbDriveStatus: 'mounted',
    logger,
  });
  userEvent.click(screen.getByText('Save PDFs'));
  const modal = await screen.findByRole('alertdialog');

  userEvent.click(within(modal).getByText('Custom'));
  await within(modal).findByText('Ballot PDFs Saved');
  expect(window.kiosk!.saveAs).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({ disposition: 'success' })
  );
});

test('modal renders error message appropriately', async () => {
  // Trigger error by simulating no file chosen at "Save As" prompt
  window.kiosk!.saveAs = jest.fn().mockResolvedValue(undefined);
  renderInAppContext(<ExportBallotPdfsButton />, {
    usbDriveStatus: 'mounted',
  });
  userEvent.click(screen.getByText('Save PDFs'));
  const modal = await screen.findByRole('alertdialog');

  userEvent.click(within(modal).getByText('Custom'));

  await within(modal).findByText('Failed to Save Ballot PDFs');
  expect(modal).toBeInTheDocument();
  within(modal).getByText(/An error occurred:/);
  within(modal).getByText(/could not save; no file was chosen/);
});
