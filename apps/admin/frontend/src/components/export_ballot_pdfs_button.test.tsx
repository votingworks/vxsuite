import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { getDisplayElectionHash } from '@votingworks/types';
import { UsbDriveStatus } from '@votingworks/shared-frontend';
import { assert } from '@votingworks/basics';
import React from 'react';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';
import { mockUsbDrive } from '../../test/helpers/mock_usb_drive';
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
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected', 'bad_format'];

  for (const usbStatus of usbStatuses) {
    const { unmount } = renderInAppContext(<ExportBallotPdfsButton />, {
      usbDrive: mockUsbDrive(usbStatus),
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
      usbDrive: mockUsbDrive(usbStatus),
    });
    userEvent.click(screen.getByText('Save PDFs'));
    const modal = await screen.findByRole('alertdialog');
    within(modal).getByText('Loading');

    unmount();
  }
});

test('modal happy path flow works', async () => {
  const logger = fakeLogger();
  const usbDrive = mockUsbDrive('mounted');
  renderInAppContext(<ExportBallotPdfsButton />, {
    logger,
    usbDrive,
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
    `fake mount point/ballot-pdfs/ballot-pdfs-election-${getDisplayElectionHash(
      electionWithMsEitherNeitherDefinition
    )}-live.zip`
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    expect.objectContaining({ disposition: 'success' })
  );

  expect(modal).toBeInTheDocument();
  userEvent.click(within(modal).getByText('Eject USB'));
  expect(usbDrive.eject).toHaveBeenCalledTimes(1);
  userEvent.click(within(modal).getByText('Close'));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});

test('can select options to save different ballots', async () => {
  renderInAppContext(<ExportBallotPdfsButton />, {
    usbDrive: mockUsbDrive('mounted'),
  });

  userEvent.click(screen.getByText('Save PDFs'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(within(modal).getByText('Absentee'));
  userEvent.click(within(modal).getByText('Sample'));
  userEvent.click(within(modal).getByText('Save'));
  await within(modal).findByText('Ballot PDFs Saved');

  expect(window.kiosk!.writeFile).toHaveBeenCalledWith(
    `fake mount point/ballot-pdfs/ballot-pdfs-election-${getDisplayElectionHash(
      electionWithMsEitherNeitherDefinition
    )}-sample-absentee.zip`
  );
});

test('modal custom flow works', async () => {
  const logger = fakeLogger();
  renderInAppContext(<ExportBallotPdfsButton />, {
    usbDrive: mockUsbDrive('mounted'),
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
    usbDrive: mockUsbDrive('mounted'),
  });
  userEvent.click(screen.getByText('Save PDFs'));
  const modal = await screen.findByRole('alertdialog');

  userEvent.click(within(modal).getByText('Custom'));

  await within(modal).findByText('Failed to Save Ballot PDFs');
  expect(modal).toBeInTheDocument();
  within(modal).getByText(/An error occurred:/);
  within(modal).getByText(/could not save; no file was chosen/);
});
