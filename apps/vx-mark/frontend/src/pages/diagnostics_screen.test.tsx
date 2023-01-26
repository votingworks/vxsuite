import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockDate from 'mockdate';
import { fakeMarkerInfo } from '@votingworks/test-utils';
import { MemoryHardware } from '@votingworks/utils';
import { MemoryRouter } from 'react-router-dom';
import {
  DiagnosticsScreen,
  DiagnosticsScreenProps,
} from './diagnostics_screen';
import { fakeDevices } from '../../test/helpers/fake_devices';
import { AriaScreenReader } from '../utils/ScreenReader';
import { fakeTts } from '../../test/helpers/fake_tts';

// Unfortunately, since the icons are rendered in CSS ::before pseudo-elements,
// we can't check for them in the rendered HTML output. The
// jest-styled-components library does enable us to check for this, but we would
// need to upgrade jest first (https://github.com/votingworks/vxsuite/issues/1622).
// For now, we just hardcode the styled-components generated class names of the
// Text components with the various icons.
function expectToHaveSuccessIcon(element: HTMLElement) {
  expect(element).toHaveClass('sc-bdvvaa jElMFl');
}
function expectToHaveWarningIcon(element: HTMLElement) {
  expect(element).toHaveClass('sc-bdvvaa gOYdAO');
}

function renderScreen(props: Partial<DiagnosticsScreenProps> = {}) {
  return render(
    <MemoryRouter>
      <DiagnosticsScreen
        hardware={MemoryHardware.buildStandard()}
        devices={fakeDevices()}
        screenReader={new AriaScreenReader(fakeTts())}
        onBackButtonPress={jest.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  MockDate.set('2022-03-23T11:23:00.000Z');
});

describe('System Diagnostics screen: Computer section', () => {
  it('shows the battery level and power cord status', () => {
    const devices = fakeDevices({
      computer: { batteryLevel: 0.05, batteryIsLow: true },
    });
    const { unmount } = renderScreen({ devices });

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

  it('shows a warning when the power cord is not connected', () => {
    const devices = fakeDevices({
      computer: { batteryIsCharging: false },
    });
    const { unmount } = renderScreen({ devices });

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

describe('System Diagnostics screen: Printer section', () => {
  it('shows the current printer status and has a button to refresh', async () => {
    const hardware = MemoryHardware.buildStandard();
    renderScreen({ hardware });

    const printerSection = screen
      .getByRole('heading', { name: 'Printer' })
      .closest('section')!;
    within(printerSection).getByText('Loading printer status…');

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
      state: 'stopped',
      stateReasons: ['marker-supply-low-warning'],
      markerInfos: [fakeMarkerInfo({ level: 2 })],
    });
    userEvent.click(refreshButton);

    within(printerSection).getByText('Loading printer status…');

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
    hardware.setPrinterIppAttributes({
      state: 'unknown',
    });
    renderScreen({ hardware });

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
    hardware.setPrinterIppAttributes({
      state: 'stopped',
      stateReasons: [
        'media-empty',
        'marker-supply-low-report',
        'door-open-warning',
        'media-needed-error',
      ],
      markerInfos: [fakeMarkerInfo()],
    });
    renderScreen({ hardware });

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
    hardware.setPrinterIppAttributes({
      state: 'stopped',
      stateReasons: ['some-other-reason-warning'],
      markerInfos: [fakeMarkerInfo()],
    });
    renderScreen({ hardware });

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
    hardware.setPrinterIppAttributes({
      state: 'stopped',
      stateReasons: ['123'],
      markerInfos: [fakeMarkerInfo()],
    });
    renderScreen({ hardware });

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
    hardware.setPrinterIppAttributes({
      state: 'idle',
      stateReasons: ['none'],
      markerInfos: [fakeMarkerInfo({ level: -2 })],
    });
    renderScreen({ hardware });

    const printerSection = screen
      .getByRole('heading', { name: 'Printer' })
      .closest('section')!;
    const tonerLevelText = await within(printerSection).findByText(
      'Toner level: Unknown'
    );
    expectToHaveWarningIcon(tonerLevelText);
  });
});

describe('System Diagnostics screen: Accessible Controller section', () => {
  it('shows the connection status, has a button to open test, and shows test results', async () => {
    const mockTts = fakeTts();
    const screenReader = new AriaScreenReader(mockTts);
    const { unmount } = renderScreen({ screenReader });

    let controllerSection = screen
      .getByRole('heading', { name: 'Accessible Controller' })
      .closest('section')!;
    const connectionText = within(controllerSection).getByText(
      'Accessible controller connected.'
    );
    expectToHaveSuccessIcon(connectionText);

    userEvent.click(
      within(controllerSection).getByText('Start Accessible Controller Test')
    );

    // Execute happy path so we can get a test result
    // We have to wrap key presses in act to avoid a warning. This may be due
    // to the fact that the keyDown listener is attached to the document
    // instead of a React component.
    await screen.findByText('Press the up button.');
    act(() => void userEvent.keyboard('{ArrowUp}'));
    await screen.findByText('Press the down button.');
    act(() => void userEvent.keyboard('{ArrowDown}'));
    await screen.findByText('Press the left button.');
    act(() => void userEvent.keyboard('{ArrowLeft}'));
    await screen.findByText('Press the right button.');
    act(() => void userEvent.keyboard('{ArrowRight}'));
    await screen.findByText('Press the select button.');
    act(() => void userEvent.keyboard('{Enter}'));
    await screen.findByText('Confirm sound is working.');
    act(() => void userEvent.keyboard('{ArrowRight}'));
    await waitFor(() => expect(mockTts.speak).toHaveBeenCalled());
    act(() => void userEvent.keyboard('{Enter}'));

    controllerSection = (
      await screen.findByRole('heading', { name: 'Accessible Controller' })
    ).closest('section')!;
    const testResultText = within(controllerSection).getByText('Test passed.');
    expectToHaveSuccessIcon(testResultText);
    within(controllerSection).getByText('Last tested at 11:23 AM');

    // Bonus test - if we start a new test and cancel it, last results should still be shown
    MockDate.set(new Date());
    userEvent.click(
      within(controllerSection).getByText('Start Accessible Controller Test')
    );
    userEvent.click(screen.getByRole('button', { name: 'Cancel Test' }));

    controllerSection = (
      await screen.findByRole('heading', { name: 'Accessible Controller' })
    ).closest('section')!;
    within(controllerSection).getByText('Test passed.');
    within(controllerSection).getByText('Last tested at 11:23 AM');

    unmount();
  });

  it('shows when the controller is disconnected', () => {
    const devices = fakeDevices();
    devices.accessibleController = undefined;
    const { unmount } = renderScreen({ devices });

    const controllerSection = screen
      .getByRole('heading', { name: 'Accessible Controller' })
      .closest('section')!;
    const connectionText = within(controllerSection).getByText(
      'No accessible controller connected.'
    );
    expectToHaveWarningIcon(connectionText);
    expect(
      within(controllerSection).queryByText('Start Accessible Controller Test')
    ).not.toBeInTheDocument();

    unmount();
  });

  it('shows failed test results', async () => {
    const { unmount } = renderScreen();

    userEvent.click(screen.getByText('Start Accessible Controller Test'));

    await screen.findByText('Press the up button.');
    userEvent.click(
      screen.getByRole('button', { name: 'Up Button is Not Working' })
    );

    const controllerSection = (
      await screen.findByRole('heading', { name: 'Accessible Controller' })
    ).closest('section')!;
    const testResultText = within(controllerSection).getByText(
      'Test failed: Up button is not working.'
    );
    expectToHaveWarningIcon(testResultText);

    unmount();
  });
});
