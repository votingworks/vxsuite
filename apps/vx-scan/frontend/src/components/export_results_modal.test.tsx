import React from 'react';

import { fireEvent, waitFor } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';

import { fakeKiosk, fakeUsbDrive, Inserted } from '@votingworks/test-utils';
import { Logger, LogSource } from '@votingworks/logging';
import { UsbDriveStatus } from '@votingworks/ui';
import { err } from '@votingworks/types';
import {
  ExportResultsModal,
  ExportResultsModalProps,
} from './export_results_modal';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';
import { AppContext } from '../contexts/app_context';
import { MachineConfig } from '../config/types';
import { renderInAppContext } from '../../test/helpers/render_in_app_context';
import { createApiMock } from '../../test/helpers/mock_api_client';
<<<<<<< HEAD
import { ApiClientContext } from '../api/api';
import { mockUsbDrive } from '../../test/helpers/mock_usb_drive';
=======
import { ApiClientContext } from '../api';
>>>>>>> aeeda048d (Move src/api/api.ts -> src/api.ts)

const apiMock = createApiMock();
const machineConfig: MachineConfig = { machineId: '0003', codeVersion: 'TEST' };
const auth = Inserted.fakeElectionManagerAuth();

function renderModal(props: Partial<ExportResultsModalProps> = {}) {
  return renderInAppContext(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <ExportResultsModal
        onClose={jest.fn()}
        usbDrive={mockUsbDrive('mounted')}
        {...props}
      />
    </ApiClientContext.Provider>,
    { auth }
  );
}

beforeEach(() => {
  apiMock.mockApiClient.reset();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const status of usbStatuses) {
    const { getByText, unmount } = renderModal({
      usbDrive: mockUsbDrive(status),
    });
    getByText('Loading');
    unmount();
  }
});

test('render no usb found screen when there is not a compatible mounted usb drive', () => {
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected', 'bad_format'];

  for (const status of usbStatuses) {
    const closeFn = jest.fn();
    const { getByText, unmount, getByAltText } = renderModal({
      usbDrive: mockUsbDrive(status),
      onClose: closeFn,
    });
    getByText('No USB Drive Detected');
    getByText('Please insert a USB drive in order to save CVRs.');
    getByAltText('Insert USB Image');

    fireEvent.click(getByText('Cancel'));
    expect(closeFn).toHaveBeenCalled();

    unmount();
  }
});

test('render export modal when a usb drive is mounted as expected and allows export', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.writeFile.mockResolvedValue(
    fakeFileWriter() as unknown as ReturnType<KioskBrowser.Kiosk['writeFile']>
  );
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);

  apiMock.expectExportCastVoteRecordsToUsbDrive(machineConfig.machineId);

  const onClose = jest.fn();
  const usbDrive = mockUsbDrive('mounted');
  const { getByText, rerender } = renderModal({
    onClose,
    usbDrive,
  });
  getByText('Save CVRs');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('CVRs Saved to USB Drive'));

  fireEvent.click(getByText('Eject USB'));
  expect(usbDrive.eject).toHaveBeenCalled();
  fireEvent.click(getByText('Cancel'));
  expect(usbDrive.eject).toHaveBeenCalled();

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
      <ApiClientContext.Provider value={apiMock.mockApiClient}>
        <ExportResultsModal
          onClose={onClose}
          usbDrive={mockUsbDrive('ejected')}
        />
      </ApiClientContext.Provider>
    </AppContext.Provider>
  );
  getByText('USB Drive Ejected');
  getByText('You may now take the USB Drive to VxAdmin for tabulation.');
});

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  apiMock.mockApiClient.exportCastVoteRecordsToUsbDrive
    .expectCallWith({ machineId: machineConfig.machineId })
    .resolves(
      err({ type: 'file-system-error', message: 'Something went wrong.' })
    );

  const onClose = jest.fn();
  const { getByText } = renderModal({ onClose });
  getByText('Save CVRs');

  fireEvent.click(getByText('Save'));
  await waitFor(() => getByText('Failed to save CVRs. Something went wrong.'));

  fireEvent.click(getByText('Close'));
  expect(onClose).toHaveBeenCalled();
});
