import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { usbstick } from '@votingworks/utils';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ExportElectionBallotPackageModalButton } from './export_election_ballot_package_modal_button';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';

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

test('Button renders properly when not clicked', async () => {
  const { queryByText, queryByTestId } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />
  );

  expect(queryByText('Export Ballot Package')).toHaveProperty('type', 'button');
  expect(queryByTestId('modal')).toBeNull();
});

test('Modal renders insert usb screen appropriately', async () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.recentlyEjected,
    UsbDriveStatus.notavailable,
  ];

  for (const usbStatus of usbStatuses) {
    const {
      unmount,
      getByText,
      queryAllByText,
      queryAllByAltText,
      queryAllByTestId,
    } = renderInAppContext(<ExportElectionBallotPackageModalButton />, {
      usbDriveStatus: usbStatus,
    });
    fireEvent.click(getByText('Export Ballot Package'));
    await waitFor(() => getByText('No USB Drive Detected'));
    expect(queryAllByAltText('Insert USB Image')).toHaveLength(1);
    expect(queryAllByTestId('modal')).toHaveLength(1);
    expect(
      queryAllByText(
        'Please insert a USB drive in order to export the ballot configuration.'
      )
    ).toHaveLength(1);

    fireEvent.click(getByText('Cancel'));
    expect(queryAllByTestId('modal')).toHaveLength(0);

    unmount();
  }
});

test('Modal renders export confirmation screen when usb detected and manual link works as expected', async () => {
  const logger = new Logger(LogSource.VxAdminFrontend);
  const logSpy = jest.spyOn(logger, 'log').mockResolvedValue();
  const {
    getByText,
    queryAllByText,
    queryAllByAltText,
    queryAllByTestId,
  } = renderInAppContext(<ExportElectionBallotPackageModalButton />, {
    usbDriveStatus: UsbDriveStatus.mounted,
    logger,
  });
  fireEvent.click(getByText('Export Ballot Package'));
  await waitFor(() =>
    expect(queryAllByText('Export Ballot Package')).toHaveLength(2)
  );
  expect(queryAllByAltText('Insert USB Image')).toHaveLength(1);
  expect(queryAllByTestId('modal')).toHaveLength(1);
  expect(
    queryAllByText(
      /A zip archive will automatically be saved to the default location on the mounted USB drive./
    )
  ).toHaveLength(1);
  expect(
    queryAllByText(/Optionally, you may pick a custom export location./)
  ).toHaveLength(1);

  fireEvent.click(getByText('Custom'));
  await waitFor(() => getByText(/Download Complete/));
  await waitFor(() => {
    expect(window.kiosk!.saveAs).toHaveBeenCalledTimes(1);
  });
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ExportBallotPackageInit,
    'admin'
  );
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ExportBallotPackageComplete,
    'admin',
    expect.objectContaining({ disposition: 'success' })
  );

  fireEvent.click(getByText('Close'));
  expect(queryAllByTestId('modal')).toHaveLength(0);
});

test('Modal renders loading screen when usb drive is mounting or ejecting', async () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting];

  for (const usbStatus of usbStatuses) {
    const { unmount, queryAllByTestId, getByText } = renderInAppContext(
      <ExportElectionBallotPackageModalButton />,
      {
        usbDriveStatus: usbStatus,
      }
    );
    fireEvent.click(getByText('Export Ballot Package'));
    await waitFor(() => getByText('Loading'));

    expect(queryAllByTestId('modal')).toHaveLength(1);

    expect(getByText('Cancel')).toBeDisabled();
    unmount();
  }
});

test('Modal renders error message appropriately', async () => {
  const logger = new Logger(LogSource.VxAdminFrontend);
  const logSpy = jest.spyOn(logger, 'log').mockResolvedValue();
  window.kiosk!.saveAs = jest.fn().mockResolvedValue(undefined);
  const { queryAllByTestId, getByText, queryAllByText } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
      logger,
    }
  );
  fireEvent.click(getByText('Export Ballot Package'));
  await waitFor(() => getByText('Export'));

  fireEvent.click(getByText('Custom'));

  await waitFor(() => getByText(/Download Failed/));
  expect(queryAllByTestId('modal')).toHaveLength(1);
  expect(queryAllByText(/An error occurred:/)).toHaveLength(1);
  expect(
    queryAllByText(/could not begin download; no file was chosen/)
  ).toHaveLength(1);

  fireEvent.click(getByText('Close'));
  expect(queryAllByTestId('modal')).toHaveLength(0);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ExportBallotPackageInit,
    'admin'
  );
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ExportBallotPackageComplete,
    'admin',
    expect.objectContaining({ disposition: 'failure' })
  );
});

test('Modal renders renders loading message while rendering ballots appropriately', async () => {
  const ejectFunction = jest.fn();
  const { queryAllByTestId, getByText, queryAllByText } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
      usbDriveEject: ejectFunction,
    }
  );
  fireEvent.click(getByText('Export Ballot Package'));
  await waitFor(() => getByText('Export'));

  fireEvent.click(getByText('Export'));

  await waitFor(() => getByText(/Download Complete/));
  expect(window.kiosk!.writeFile).toHaveBeenCalledTimes(1);
  expect(window.kiosk!.makeDirectory).toHaveBeenCalledTimes(1);

  expect(queryAllByTestId('modal')).toHaveLength(1);
  expect(
    queryAllByText(
      /You may now eject the USB device and connect it with your ballot scanning machine to configure it./
    )
  );

  expect(queryAllByText('Eject USB')).toHaveLength(1);
  fireEvent.click(getByText('Eject USB'));
  expect(ejectFunction).toHaveBeenCalledTimes(1);

  fireEvent.click(getByText('Close'));
  expect(queryAllByTestId('modal')).toHaveLength(0);
});
