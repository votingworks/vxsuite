import React from 'react';

import { fireEvent, waitFor } from '@testing-library/react';
import {
  electionSampleDefinition as electionDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { usbstick } from '@votingworks/utils';
import fetchMock from 'fetch-mock';

import { fakeKiosk, fakeUsbDrive, Inserted } from '@votingworks/test-utils';
import { Logger, LogSource } from '@votingworks/logging';
import { ExportResultsModal } from './export_results_modal';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';
import { AppContext } from '../contexts/app_context';
import { MachineConfig } from '../config/types';
import { renderInAppContext } from '../../test/helpers/render_in_app_context';

const { UsbDriveStatus } = usbstick;

const machineConfig: MachineConfig = { machineId: '0003', codeVersion: 'TEST' };
const auth = Inserted.fakeElectionManagerAuth();

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount } = renderInAppContext(
      <ExportResultsModal
        onClose={closeFn}
        usbDrive={{ status, eject: jest.fn() }}
        scannedBallotCount={5}
        isTestMode
      />,
      { auth }
    );
    getByText('Loading');
    unmount();
  }
});

test('render no usb found screen when there is not a mounted usb drive', () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.notavailable,
    UsbDriveStatus.recentlyEjected,
  ];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount, getByAltText } = renderInAppContext(
      <ExportResultsModal
        onClose={closeFn}
        usbDrive={{ status, eject: jest.fn() }}
        scannedBallotCount={5}
        isTestMode
      />,
      { auth }
    );
    getByText('No USB Drive Detected');
    getByText('Please insert a USB drive in order to save CVRs.');
    getByAltText('Insert USB Image');

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('render export modal when a usb drive is mounted as expected and allows custom export', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.saveAs = jest.fn().mockResolvedValue(fakeFileWriter());
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);

  fetchMock.postOnce('/precinct-scanner/export', {
    body: '',
  });

  const closeFn = jest.fn();
  const { getByText, getByAltText } = renderInAppContext(
    <ExportResultsModal
      onClose={closeFn}
      usbDrive={{ status: UsbDriveStatus.mounted, eject: jest.fn() }}
      scannedBallotCount={5}
      isTestMode
    />,
    { auth }
  );
  getByText('Save CVRs');
  getByText(
    /A CVR file will automatically be saved to the default location on the mounted USB drive. /
  );
  getByAltText('Insert USB Image');

  fireEvent.click(getByText('Custom'));
  await waitFor(() => getByText('CVRs Saved to USB Drive'));
  await waitFor(() => {
    expect(mockKiosk.saveAs).toHaveBeenCalledTimes(1);
  });
  expect(fetchMock.called('/precinct-scanner/export')).toBe(true);

  fireEvent.click(getByText('Cancel'));
  expect(closeFn).toHaveBeenCalled();
});

test('render export modal when a usb drive is mounted as expected and allows automatic export', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.writeFile.mockResolvedValue(
    fakeFileWriter() as unknown as ReturnType<KioskBrowser.Kiosk['writeFile']>
  );
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);

  fetchMock.postOnce('/precinct-scanner/export', {
    body: '',
  });

  const closeFn = jest.fn();
  const ejectFn = jest.fn();
  const { getByText, rerender } = renderInAppContext(
    <ExportResultsModal
      onClose={closeFn}
      usbDrive={{ status: UsbDriveStatus.mounted, eject: ejectFn }}
      scannedBallotCount={5}
      isTestMode
    />,
    { auth }
  );
  getByText('Save CVRs');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('CVRs Saved to USB Drive'));
  await waitFor(() => {
    expect(mockKiosk.makeDirectory).toHaveBeenCalledTimes(1);
  });
  expect(mockKiosk.makeDirectory).toHaveBeenCalledWith(
    `fake mount point/cast-vote-records/franklin-county_general-election_${electionDefinition.electionHash.slice(
      0,
      10
    )}`,
    { recursive: true }
  );
  expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
  expect(mockKiosk.writeFile).toHaveBeenCalledWith(
    expect.stringMatching(
      `fake mount point/cast-vote-records/franklin-county_general-election_${electionDefinition.electionHash.slice(
        0,
        10
      )}/TEST__machine_0003__5_ballots`
    )
  );
  expect(fetchMock.called('/precinct-scanner/export')).toBe(true);

  fireEvent.click(getByText('Eject USB'));
  expect(ejectFn).toHaveBeenCalled();
  fireEvent.click(getByText('Cancel'));
  expect(closeFn).toHaveBeenCalled();

  rerender(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        isSoundMuted: false,
        machineConfig,
        auth,
        logger: new Logger(LogSource.VxScanFrontend),
      }}
    >
      <ExportResultsModal
        onClose={closeFn}
        usbDrive={{ status: UsbDriveStatus.recentlyEjected, eject: ejectFn }}
        scannedBallotCount={5}
        isTestMode
      />
    </AppContext.Provider>
  );
  getByText('USB Drive Ejected');
  getByText('You may now take the USB Drive to VxAdmin for tabulation.');
});

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  fetchMock.postOnce('/precinct-scanner/export', {
    body: '',
  });

  const closeFn = jest.fn();
  const { getByText } = renderInAppContext(
    <ExportResultsModal
      onClose={closeFn}
      usbDrive={{ status: UsbDriveStatus.mounted, eject: jest.fn() }}
      scannedBallotCount={5}
      isTestMode
    />,
    { auth }
  );
  getByText('Save CVRs');

  mockKiosk.getUsbDrives.mockRejectedValueOnce(new Error('NOPE'));
  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('Failed to Save CVRs'));
  getByText(/Failed to save CVRs./);
  getByText(/NOPE/);

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});
