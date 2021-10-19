import React from 'react';

import { render, fireEvent, waitFor } from '@testing-library/react';
import {
  electionSampleDefinition as electionDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { usbstick } from '@votingworks/utils';
import fetchMock from 'fetch-mock';

import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import ExportResultsModal from './ExportResultsModal';
import fakeFileWriter from '../../test/helpers/fakeFileWriter';
import AppContext from '../contexts/AppContext';

const { UsbDriveStatus } = usbstick;

const machineConfig = { machineId: '0003', codeVersion: 'TEST' };

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount } = render(
      <AppContext.Provider
        value={{ electionDefinition: electionSampleDefinition, machineConfig }}
      >
        <ExportResultsModal
          onClose={closeFn}
          usbDrive={{ status, eject: jest.fn() }}
          scannedBallotCount={5}
          isTestMode
        />
      </AppContext.Provider>
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
    const { getByText, unmount, getByAltText } = render(
      <AppContext.Provider
        value={{ electionDefinition: electionSampleDefinition, machineConfig }}
      >
        <ExportResultsModal
          onClose={closeFn}
          usbDrive={{ status, eject: jest.fn() }}
          scannedBallotCount={5}
          isTestMode
        />
      </AppContext.Provider>
    );
    getByText('No USB Drive Detected');
    getByText(
      'Please insert a USB drive in order to export the scanner results.'
    );
    getByAltText('Insert USB Image');

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('render export modal when a usb drive is mounted as expected and allows custom export', async () => {
  const mockKiosk = fakeKiosk();
  const fileWriter = fakeFileWriter();
  window.kiosk = mockKiosk;
  const saveAsFunction = jest.fn().mockResolvedValue(fileWriter);
  mockKiosk.saveAs = saveAsFunction;
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);

  fetchMock.postOnce('/scan/export', {
    body: '',
  });

  const closeFn = jest.fn();
  const { getByText, getByAltText } = render(
    <AppContext.Provider
      value={{ electionDefinition: electionSampleDefinition, machineConfig }}
    >
      <ExportResultsModal
        onClose={closeFn}
        usbDrive={{ status: UsbDriveStatus.mounted, eject: jest.fn() }}
        scannedBallotCount={5}
        isTestMode
      />
    </AppContext.Provider>
  );
  getByText('Export Results');
  getByText(
    /A CVR file will automatically be saved to the default location on the mounted USB drive. /
  );
  getByAltText('Insert USB Image');

  fireEvent.click(getByText('Custom'));
  await waitFor(() => getByText(/Download Complete/));
  await waitFor(() => {
    expect(saveAsFunction).toHaveBeenCalledTimes(1);
  });
  expect(fetchMock.called('/scan/export')).toBe(true);

  fireEvent.click(getByText('Cancel'));
  expect(closeFn).toHaveBeenCalled();
});

test('render export modal when a usb drive is mounted as expected and allows automatic export', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);

  fetchMock.postOnce('/scan/export', {
    body: '',
  });

  const closeFn = jest.fn();
  const ejectFn = jest.fn();
  const { getByText, rerender } = render(
    <AppContext.Provider
      value={{ electionDefinition: electionSampleDefinition, machineConfig }}
    >
      <ExportResultsModal
        onClose={closeFn}
        usbDrive={{ status: UsbDriveStatus.mounted, eject: ejectFn }}
        scannedBallotCount={5}
        isTestMode
      />
    </AppContext.Provider>
  );
  getByText('Export Results');

  fireEvent.click(getByText('Export'));
  await waitFor(() => getByText(/Download Complete/));
  await waitFor(() => {
    expect(mockKiosk.makeDirectory).toHaveBeenCalledTimes(1);
  });
  expect(
    mockKiosk.makeDirectory
  ).toHaveBeenCalledWith(
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
    ),
    expect.anything()
  );
  expect(fetchMock.called('/scan/export')).toBe(true);

  fireEvent.click(getByText('Eject USB'));
  expect(ejectFn).toHaveBeenCalled();
  fireEvent.click(getByText('Cancel'));
  expect(closeFn).toHaveBeenCalled();

  rerender(
    <AppContext.Provider
      value={{ electionDefinition: electionSampleDefinition, machineConfig }}
    >
      <ExportResultsModal
        onClose={closeFn}
        usbDrive={{ status: UsbDriveStatus.recentlyEjected, eject: ejectFn }}
        scannedBallotCount={5}
        isTestMode
      />
    </AppContext.Provider>
  );
  getByText('Download Complete');
  getByText(
    'USB drive successfully ejected, you may now take it to Election Manager for tabulation.'
  );
});

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  fetchMock.postOnce('/scan/export', {
    body: '',
  });

  const closeFn = jest.fn();
  const { getByText } = render(
    <AppContext.Provider
      value={{ electionDefinition: electionSampleDefinition, machineConfig }}
    >
      <ExportResultsModal
        onClose={closeFn}
        usbDrive={{ status: UsbDriveStatus.mounted, eject: jest.fn() }}
        scannedBallotCount={5}
        isTestMode
      />
    </AppContext.Provider>
  );
  getByText('Export Results');

  mockKiosk.getUsbDrives.mockRejectedValueOnce(new Error('NOPE'));
  fireEvent.click(getByText('Export'));
  await waitFor(() => getByText(/Download Failed/));
  getByText(/Failed to save results./);
  getByText(/NOPE/);

  fireEvent.click(getByText('Close'));
  expect(closeFn).toHaveBeenCalled();
});
