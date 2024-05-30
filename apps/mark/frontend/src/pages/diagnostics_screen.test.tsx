import userEvent from '@testing-library/user-event';
import { advanceTimersAndPromises, mockOf } from '@votingworks/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { DateTime } from 'luxon';
import { act } from 'react';
import { IppMarkerInfo } from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';
import {
  DiagnosticsScreen,
  DiagnosticsScreenProps,
} from './diagnostics_screen';
import { AccessibleControllerDiagnosticScreen } from './accessible_controller_diagnostic_screen';
import { ApiProvider } from '../api_provider';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ACCESSIBLE_CONTROLLER_POLLING_INTERVAL_MS } from '../api';

export const MOCK_MARKER_INFO: IppMarkerInfo = {
  color: '#000000',
  highLevel: 100,
  level: 2,
  lowLevel: 2,
  name: 'black cartridge',
  type: 'toner-cartridge',
};

jest.mock(
  './accessible_controller_diagnostic_screen',
  (): typeof import('./accessible_controller_diagnostic_screen') => ({
    ...jest.requireActual('./accessible_controller_diagnostic_screen'),
    AccessibleControllerDiagnosticScreen: jest.fn(),
  })
);

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

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
    <ApiProvider apiClient={apiMock.mockApiClient} noAudio>
      <MemoryRouter>
        <DiagnosticsScreen onBackButtonPress={jest.fn()} {...props} />
      </MemoryRouter>
    </ApiProvider>
  );
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2022-03-23T11:23:00.000'));
});

describe('System Diagnostics screen: Computer section', () => {
  it('shows the battery level and power cord status', async () => {
    apiMock.setBatteryInfo({ level: 0.05, discharging: false });
    const { unmount } = renderScreen();

    screen.getByRole('heading', { name: 'System Diagnostics' });

    const batteryText = await screen.findByText('Battery: 5%');
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

  it('shows a warning when the power cord is not connected', async () => {
    apiMock.setBatteryInfo({ level: 0.8, discharging: true });
    const { unmount } = renderScreen();

    const batteryText = await screen.findByText('Battery: 80%');
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
  it('shows the current printer status', async () => {
    apiMock.setPrinterStatus({
      connected: true,
      richStatus: {
        state: 'stopped',
        stateReasons: ['marker-supply-low-warning'],
        markerInfos: [MOCK_MARKER_INFO],
      },
    });

    renderScreen();

    const printerStatusText = await screen.findByText(
      'Stopped - The printer is low on toner. Replace toner cartridge.'
    );
    expectToHaveWarningIcon(printerStatusText);
    const tonerLevelText = screen.getByText('Toner Level: 2%');
    expectToHaveWarningIcon(tonerLevelText);
  });
});

describe('System Diagnostics screen: Accessible Controller section', () => {
  it('shows the connection status, has a button to open test, and shows test results', async () => {
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

    await screen.findByText('Accessible controller connected.');

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

  it('shows connection status', async () => {
    const { unmount } = renderScreen();

    const connectedText = await screen.findByText(
      'Accessible controller connected.'
    );
    expectToHaveSuccessIcon(connectedText);
    expect(
      screen.queryByText('Start Accessible Controller Test')
    ).toBeInTheDocument();

    act(() => {
      apiMock.setAccessibleControllerConnected(false);
    });
    await advanceTimersAndPromises(
      ACCESSIBLE_CONTROLLER_POLLING_INTERVAL_MS / 1000
    );

    const disconnectedText = await screen.findByText(
      'No accessible controller connected.'
    );
    expectToHaveWarningIcon(disconnectedText);
    expect(
      screen.queryByText('Start Accessible Controller Test')
    ).not.toBeInTheDocument();

    unmount();
  });

  it('shows failed test results', async () => {
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

    await screen.findByText('Accessible controller connected.');
    userEvent.click(screen.getByText('Start Accessible Controller Test'));

    userEvent.click(screen.getByTestId('mockFail'));

    const testResultText = screen.getByText(
      'Test failed: Up button is not working.'
    );
    expectToHaveWarningIcon(testResultText);

    unmount();
  });
});
