import React from 'react';
import userEvent from '@testing-library/user-event';
import MockDate from 'mockdate';
import { fakeMarkerInfo } from '@votingworks/test-utils';
import { MemoryHardware } from '@votingworks/utils';
import { MemoryRouter } from 'react-router-dom';
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import {
  CHECKBOX_ICON_TEST_ID,
  DiagnosticsScreen,
  DiagnosticsScreenProps,
  WARNING_ICON_TEST_ID,
} from './diagnostics_screen';
import { fakeDevices } from '../../test/helpers/fake_devices';
import { AriaScreenReader } from '../utils/ScreenReader';
import { fakeTts } from '../../test/helpers/fake_tts';

function expectToHaveSuccessIcon(element: HTMLElement) {
  within(element).getByTestId(CHECKBOX_ICON_TEST_ID);
}
function expectToHaveWarningIcon(element: HTMLElement) {
  within(element).getByTestId(WARNING_ICON_TEST_ID);
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

    const batteryText = screen.getByText('Battery: 5%');
    // The battery level always has a success icon, even when it's low, since
    // it's only an actionable problem if the computer is not connected to
    // power, and that would trigger a full-screen alert
    expectToHaveSuccessIcon(batteryText);
    const powerCordText = screen.getByText('Power cord connected.');
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

    const batteryText = screen.getByText('Battery: 80%');
    expectToHaveSuccessIcon(batteryText);
    const powerCordText = screen.getByText(
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

    screen.getByText('Loading printer status…');

    let printerStatusText = await screen.findByText('Printer status: Ready');
    expectToHaveSuccessIcon(printerStatusText);
    let tonerLevelText = screen.getByText('Toner level: 92%');
    expectToHaveSuccessIcon(tonerLevelText);

    const refreshButton = screen.getByRole('button', {
      name: 'Refresh Printer Status',
    });
    screen.getByText('Last updated at 11:23 AM');

    hardware.setPrinterIppAttributes({
      state: 'stopped',
      stateReasons: ['marker-supply-low-warning'],
      markerInfos: [fakeMarkerInfo({ level: 2 })],
    });
    userEvent.click(refreshButton);

    screen.getByText('Loading printer status…');

    printerStatusText = await screen.findByText('Printer status: Stopped');
    expectToHaveWarningIcon(printerStatusText);
    const warningText = screen.getByText(
      'Warning: The printer is low on toner. Replace toner cartridge.'
    );
    expectToHaveWarningIcon(warningText);
    tonerLevelText = screen.getByText('Toner level: 2%');
    expectToHaveWarningIcon(tonerLevelText);
  });

  it('shows a warning when the printer status cannot be loaded', async () => {
    const hardware = MemoryHardware.buildStandard();
    hardware.setPrinterIppAttributes({
      state: 'unknown',
    });
    renderScreen({ hardware });

    const printerStatusText = await screen.findByText(
      'Could not get printer status.'
    );
    expectToHaveWarningIcon(printerStatusText);

    screen.getByRole('button', {
      name: 'Refresh Printer Status',
    });
    screen.getByText('Last updated at 11:23 AM');
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

    const warningText = await screen.findByText(
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

    const warningText = await screen.findByText('Warning: some-other-reason');
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

    await screen.findByText('Printer status: Stopped');
    expect(screen.queryByText(/Warning/)).not.toBeInTheDocument();
  });

  it("handles negative toner level (which indicates that the toner level can't be read)", async () => {
    const hardware = MemoryHardware.buildStandard();
    hardware.setPrinterIppAttributes({
      state: 'idle',
      stateReasons: ['none'],
      markerInfos: [fakeMarkerInfo({ level: -2 })],
    });
    renderScreen({ hardware });

    const tonerLevelText = await screen.findByText('Toner level: Unknown');
    expectToHaveWarningIcon(tonerLevelText);
  });
});

describe('System Diagnostics screen: Accessible Controller section', () => {
  it('shows the connection status, has a button to open test, and shows test results', async () => {
    const mockTts = fakeTts();
    const screenReader = new AriaScreenReader(mockTts);
    const { unmount } = renderScreen({ screenReader });

    const connectionText = screen.getByText('Accessible controller connected.');
    expectToHaveSuccessIcon(connectionText);

    userEvent.click(screen.getByText('Start Accessible Controller Test'));

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

    const testResultText = screen.getByText('Test passed.');
    expectToHaveSuccessIcon(testResultText);
    screen.getByText('Last tested at 11:23 AM');

    // Bonus test - if we start a new test and cancel it, last results should still be shown
    MockDate.set(new Date());
    userEvent.click(screen.getButton('Start Accessible Controller Test'));
    userEvent.click(screen.getByRole('button', { name: 'Cancel Test' }));

    screen.getByText('Test passed.');
    screen.getByText('Last tested at 11:23 AM');

    unmount();
  });

  it('shows when the controller is disconnected', () => {
    const devices = fakeDevices();
    devices.accessibleController = undefined;
    const { unmount } = renderScreen({ devices });

    const connectionText = screen.getByText(
      'No accessible controller connected.'
    );
    expectToHaveWarningIcon(connectionText);
    expect(
      screen.queryByText('Start Accessible Controller Test')
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

    const testResultText = screen.getByText(
      'Test failed: Up button is not working.'
    );
    expectToHaveWarningIcon(testResultText);

    unmount();
  });
});
