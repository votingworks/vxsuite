import React from 'react';

import { fireEvent, waitFor } from '@testing-library/react';
import { electionSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import fetchMock from 'fetch-mock';

import { Dipped, fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { MemoryStorage, usbstick } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { ExportResultsModal } from './export_results_modal';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';
import { renderInAppContext } from '../../test/render_in_app_context';
import { AppContext } from '../contexts/app_context';

const { UsbDriveStatus } = usbstick;

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount } = renderInAppContext(
      <Router history={createMemoryHistory()}>
        <ExportResultsModal
          onClose={closeFn}
          electionDefinition={electionDefinition}
          numberOfBallots={5}
          isTestMode
        />
      </Router>,
      { usbDriveStatus: status }
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
      <Router history={createMemoryHistory()}>
        <ExportResultsModal
          onClose={closeFn}
          electionDefinition={electionDefinition}
          numberOfBallots={5}
          isTestMode
        />
      </Router>,
      { usbDriveStatus: status }
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
  const fileWriter = fakeFileWriter();
  window.kiosk = mockKiosk;
  const saveAsFunction = jest.fn().mockResolvedValue(fileWriter);
  mockKiosk.saveAs = saveAsFunction;
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()]);

  fetchMock.postOnce('/scan/export', {
    body: '',
  });

  const closeFn = jest.fn();
  const { getByText, getByAltText } = renderInAppContext(
    <Router history={createMemoryHistory()}>
      <ExportResultsModal
        onClose={closeFn}
        electionDefinition={electionDefinition}
        numberOfBallots={5}
        isTestMode
      />
    </Router>,
    { usbDriveStatus: UsbDriveStatus.mounted }
  );
  getByText('Save CVRs');
  getByText(
    /A CVR file will automatically be saved to the default location on the mounted USB drive. /
  );
  getByAltText('Insert USB Image');

  fireEvent.click(getByText('Custom'));
  await waitFor(() => getByText('CVRs Saved'));
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
  const history = createMemoryHistory();
  const { getByText, rerender } = renderInAppContext(
    <ExportResultsModal
      onClose={closeFn}
      electionDefinition={electionDefinition}
      numberOfBallots={5}
      isTestMode
    />,
    { usbDriveStatus: UsbDriveStatus.mounted, history }
  );
  getByText('Save CVRs');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('CVRs Saved'));
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
  expect(fetchMock.called('/scan/export')).toBe(true);

  getByText('Eject USB');
  fireEvent.click(getByText('Cancel'));
  expect(closeFn).toHaveBeenCalled();

  rerender(
    <AppContext.Provider
      value={{
        electionDefinition,
        machineConfig: {
          machineId: '0001',
          codeVersion: 'TEST',
        },
        usbDriveStatus: UsbDriveStatus.recentlyEjected,
        usbDriveEject: jest.fn(),
        storage: new MemoryStorage(),
        auth: Dipped.fakeElectionManagerAuth(),
        logger: new Logger(LogSource.VxCentralScanFrontend),
      }}
    >
      <Router history={history}>
        <ExportResultsModal
          onClose={closeFn}
          electionDefinition={electionDefinition}
          numberOfBallots={5}
          isTestMode
        />
      </Router>
    </AppContext.Provider>
  );
  getByText(
    'USB drive successfully ejected, you may now take it to VxAdmin for tabulation.'
  );
});

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  fetchMock.postOnce('/scan/export', {
    body: '',
  });

  const closeFn = jest.fn();
  const { getByText } = renderInAppContext(
    <Router history={createMemoryHistory()}>
      <ExportResultsModal
        onClose={closeFn}
        electionDefinition={electionDefinition}
        numberOfBallots={5}
        isTestMode
      />
    </Router>,
    { usbDriveStatus: UsbDriveStatus.mounted }
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
