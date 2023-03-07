import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import React from 'react';
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils';
import { renderInAppContext } from '../../test/render_in_app_context';
import { PrintedBallotsReportScreen } from './printed_ballots_report_screen';
import { mockUsbDrive } from '../../test/helpers/mock_usb_drive';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';

beforeEach(() => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  const fileWriter = fakeFileWriter();
  mockKiosk.saveAs = jest.fn().mockResolvedValue(fileWriter);
  mockKiosk.writeFile = jest.fn().mockResolvedValue(fileWriter);
  window.kiosk = mockKiosk;
});

test('renders SaveFileToUsb component for saving PDF', async () => {
  const usbDrive = mockUsbDrive('mounted');
  renderInAppContext(<PrintedBallotsReportScreen />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    usbDrive,
  });
  userEvent.click(screen.getByText('Save Report to PDF'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Printed Ballots Report');
});
