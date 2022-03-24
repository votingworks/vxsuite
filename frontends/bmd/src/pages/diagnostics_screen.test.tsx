import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockDate from 'mockdate';
import { fakeMarkerInfo } from '@votingworks/test-utils';
import { MemoryHardware } from '@votingworks/utils';
import { DiagnosticsScreen } from './diagnostics_screen';
import { fakeDevices } from '../../test/helpers/fake_devices';

// Unfortunately, since the icons are rendered in CSS ::before pseudo-elements,
// we can't check for them in the rendered HTML output. The
// jest-styled-components library does enable us to check for this, but we would
// need to upgrade jest first (https://github.com/votingworks/vxsuite/issues/1622).
// For now, we just hardcode the styled-components generated class names of the
// Text components with the various icons.
function expectToHaveSuccessIcon(element: HTMLElement) {
  expect(element).toHaveClass('ioTMcB');
}
function expectToHaveWarningIcon(element: HTMLElement) {
  expect(element).toHaveClass('dikopi');
}

describe('System Diagnostics screen', () => {
  beforeAll(() => {
    MockDate.set('2022-03-23T11:23:00.000Z');
  });

  describe('Computer section', () => {
    it('shows the battery level and power cord status', async () => {
      const hardware = MemoryHardware.buildStandard();
      const devices = fakeDevices({
        computer: { batteryLevel: 0.05, batteryIsLow: true },
      });
      const { unmount } = render(
        <DiagnosticsScreen hardware={hardware} devices={devices} />
      );

      screen.getByRole('heading', { name: 'System Diagnostics' });

      const computerSection = screen
        .getByRole('heading', { name: 'Computer' })
        .closest('section')!;
      const batteryText = within(computerSection).getByText('Battery: 5%');
      // The battery level always has a success icon, even when it's low, since
      // it's only an actionable problem if the computer is not connected to
      // power, and that would trigger a full-screen alert
      expectToHaveSuccessIcon(batteryText);
      const powerCordText = within(computerSection).getByText(
        'Power cord connected.'
      );
      expectToHaveSuccessIcon(powerCordText);

      // Explicitly unmount before the printer status has resolved to verify that
      // we properly cancel the request for printer status.
      unmount();
    });

    it('shows a warning when the power cord is not connected', async () => {
      const hardware = MemoryHardware.buildStandard();
      const devices = fakeDevices({
        computer: { batteryIsCharging: false },
      });
      const { unmount } = render(
        <DiagnosticsScreen hardware={hardware} devices={devices} />
      );

      const computerSection = screen
        .getByRole('heading', { name: 'Computer' })
        .closest('section')!;
      const batteryText = within(computerSection).getByText('Battery: 80%');
      expectToHaveSuccessIcon(batteryText);
      const powerCordText = within(computerSection).getByText(
        'No power cord connected. Connect power cord.'
      );
      expectToHaveWarningIcon(powerCordText);

      // Explicitly unmount before the printer status has resolved to verify that
      // we properly cancel the request for printer status.
      unmount();
    });
  });

  describe('Printer section', () => {
    it('shows the current printer status and has a button to refresh', async () => {
      const hardware = MemoryHardware.buildStandard();
      const devices = fakeDevices();
      render(<DiagnosticsScreen hardware={hardware} devices={devices} />);

      const printerSection = screen
        .getByRole('heading', { name: 'Printer' })
        .closest('section')!;
      within(printerSection).getByText('Loading printer status...');

      let printerStatusText = await within(printerSection).findByText(
        'Printer status: Ready'
      );
      expectToHaveSuccessIcon(printerStatusText);
      let tonerLevelText = within(printerSection).getByText('Toner level: 92%');
      expectToHaveSuccessIcon(tonerLevelText);

      const refreshButton = within(printerSection).getByRole('button', {
        name: 'Refresh Printer Status',
      });
      within(printerSection).getByText('Last updated at 11:23 AM');

      hardware.setPrinterIppAttributes({
        state: 'stopped' as KioskBrowser.IppPrinterState,
        stateReasons: ['marker-supply-low-warning'],
        markerInfos: [fakeMarkerInfo({ level: 2 })],
      });
      userEvent.click(refreshButton);

      within(printerSection).getByText('Loading printer status...');

      printerStatusText = await within(printerSection).findByText(
        'Printer status: Stopped'
      );
      expectToHaveWarningIcon(printerStatusText);
      const warningText = within(printerSection).getByText(
        'Warning: The printer is low on toner. Replace toner cartridge.'
      );
      expectToHaveWarningIcon(warningText);
      tonerLevelText = within(printerSection).getByText('Toner level: 2%');
      expectToHaveWarningIcon(tonerLevelText);
    });

    it('shows a warning when the printer status cannot be loaded', async () => {
      const hardware = MemoryHardware.buildStandard();
      const devices = fakeDevices();
      hardware.setPrinterIppAttributes({
        state: 'unknown' as KioskBrowser.IppPrinterState.Unknown,
      });
      render(<DiagnosticsScreen hardware={hardware} devices={devices} />);

      const printerSection = screen
        .getByRole('heading', { name: 'Printer' })
        .closest('section')!;
      const printerStatusText = await within(printerSection).findByText(
        'Could not get printer status.'
      );
      expectToHaveWarningIcon(printerStatusText);

      within(printerSection).getByRole('button', {
        name: 'Refresh Printer Status',
      });
      within(printerSection).getByText('Last updated at 11:23 AM');
    });

    it('shows only the highest priority printer state reason', async () => {
      const hardware = MemoryHardware.buildStandard();
      const devices = fakeDevices();
      hardware.setPrinterIppAttributes({
        state: 'stopped' as KioskBrowser.IppPrinterState,
        stateReasons: [
          'media-empty',
          'marker-supply-low-report',
          'door-open-warning',
          'media-needed-error',
        ],
        markerInfos: [fakeMarkerInfo()],
      });
      render(<DiagnosticsScreen hardware={hardware} devices={devices} />);

      const printerSection = screen
        .getByRole('heading', { name: 'Printer' })
        .closest('section')!;
      const warningText = await within(printerSection).findByText(
        'Warning: The printer is out of paper. Add paper to the printer.'
      );
      expectToHaveWarningIcon(warningText);
    });

    it('shows the plain printer-state-reasons text for unrecognized printer state reasons', async () => {
      const hardware = MemoryHardware.buildStandard();
      const devices = fakeDevices();
      hardware.setPrinterIppAttributes({
        state: 'stopped' as KioskBrowser.IppPrinterState,
        stateReasons: ['some-other-reason-warning'],
        markerInfos: [fakeMarkerInfo()],
      });
      render(<DiagnosticsScreen hardware={hardware} devices={devices} />);

      const printerSection = screen
        .getByRole('heading', { name: 'Printer' })
        .closest('section')!;
      const warningText = await within(printerSection).findByText(
        'Warning: some-other-reason'
      );
      expectToHaveWarningIcon(warningText);
    });

    it("doesn't show warning when printer-state-reasons can't be parsed", async () => {
      const hardware = MemoryHardware.buildStandard();
      const devices = fakeDevices();
      hardware.setPrinterIppAttributes({
        state: 'stopped' as KioskBrowser.IppPrinterState,
        stateReasons: ['123'],
        markerInfos: [fakeMarkerInfo()],
      });
      render(<DiagnosticsScreen hardware={hardware} devices={devices} />);

      const printerSection = screen
        .getByRole('heading', { name: 'Printer' })
        .closest('section')!;
      await within(printerSection).findByText('Printer status: Stopped');
      expect(
        within(printerSection).queryByText(/Warning/)
      ).not.toBeInTheDocument();
    });

    it("handles negative toner level (which indicates that the toner level can't be read)", async () => {
      const hardware = MemoryHardware.buildStandard();
      const devices = fakeDevices();
      hardware.setPrinterIppAttributes({
        state: 'idle' as KioskBrowser.IppPrinterState,
        stateReasons: ['none'],
        markerInfos: [fakeMarkerInfo({ level: -2 })],
      });
      render(<DiagnosticsScreen hardware={hardware} devices={devices} />);

      const printerSection = screen
        .getByRole('heading', { name: 'Printer' })
        .closest('section')!;
      const tonerLevelText = await within(printerSection).findByText(
        'Toner level: Unknown'
      );
      expectToHaveWarningIcon(tonerLevelText);
    });
  });
});
