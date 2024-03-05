import userEvent from '@testing-library/user-event';
import { fakeMarkerInfo, mockOf } from '@votingworks/test-utils';
import { MemoryHardware } from '@votingworks/utils';
import { MemoryRouter } from 'react-router-dom';
import { DateTime } from 'luxon';
import { render, screen } from '../../test/react_testing_library';
import {
  DiagnosticsScreen,
  DiagnosticsScreenProps,
} from './diagnostics_screen';
import { fakeDevices } from '../../test/helpers/fake_devices';
import { AccessibleControllerDiagnosticScreen } from './accessible_controller_diagnostic_screen';

jest.mock(
  './accessible_controller_diagnostic_screen',
  (): typeof import('./accessible_controller_diagnostic_screen') => ({
    ...jest.requireActual('./accessible_controller_diagnostic_screen'),
    AccessibleControllerDiagnosticScreen: jest.fn(),
  })
);

function expectToHaveSuccessIcon(element: HTMLElement) {
  const [icon] = element.getElementsByTagName('svg');
  expect(icon).toHaveAttribute('data-icon', 'square-check');
}
function expectToHaveWarningIcon(element: HTMLElement) {
  const [icon] = element.getElementsByTagName('svg');
  expect(icon).toHaveAttribute('data-icon', 'triangle-exclamation');
}

function renderScreen(props: Partial<DiagnosticsScreenProps> = {}) {
  return render(
    <MemoryRouter>
      <DiagnosticsScreen
        hardware={MemoryHardware.buildStandard()}
        devices={fakeDevices()}
        onBackButtonPress={jest.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2022-03-23T11:23:00.000'));
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
  it('shows the connection status, has a button to open test, and shows test results', () => {
    mockOf(AccessibleControllerDiagnosticScreen).mockImplementation((props) => {
      const { onCancel, onComplete } = props;

      function pass() {
        onComplete({ completedAt: DateTime.now(), passed: true });
      }

      return (
        <div>
          <button data-testid="mockPass" onClick={pass} type="button" />
          <button data-testid="mockCancel" onClick={onCancel} type="button" />
        </div>
      );
    });

    const { unmount } = renderScreen();

    const connectionText = screen.getByText('Accessible controller connected.');
    expectToHaveSuccessIcon(connectionText);

    expect(screen.queryByTestId('mockPass')).not.toBeInTheDocument();

    userEvent.click(screen.getByText('Start Accessible Controller Test'));

    // Execute happy path so we can get a test result
    userEvent.click(screen.getByTestId('mockPass'));

    const testResultText = screen.getByText('Test passed.');
    expectToHaveSuccessIcon(testResultText);
    screen.getByText('Last tested at 11:23 AM');
    expect(screen.queryByTestId('mockPass')).not.toBeInTheDocument();

    // Bonus test - if we start a new test and cancel it, last results should still be shown
    jest.setSystemTime(new Date());
    userEvent.click(screen.getButton('Start Accessible Controller Test'));
    userEvent.click(screen.getByTestId('mockCancel'));

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

  it('shows failed test results', () => {
    mockOf(AccessibleControllerDiagnosticScreen).mockImplementation((props) => (
      <button
        data-testid="mockFail"
        onClick={() =>
          props.onComplete({
            completedAt: DateTime.now(),
            message: 'Up button is not working.',
            passed: false,
          })
        }
        type="button"
      />
    ));

    const { unmount } = renderScreen();

    userEvent.click(screen.getByText('Start Accessible Controller Test'));

    userEvent.click(screen.getByTestId('mockFail'));

    const testResultText = screen.getByText(
      'Test failed: Up button is not working.'
    );
    expectToHaveWarningIcon(testResultText);

    unmount();
  });
});
