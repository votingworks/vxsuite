import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import {
  MARK_SCAN_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME,
  mockUsbDriveStatus,
} from '@votingworks/ui';
import { ok } from '@votingworks/basics';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  fireEvent,
  render,
  screen,
  within,
} from '../../test/react_testing_library';
import {
  DiagnosticsScreen,
  DiagnosticsScreenProps,
} from './diagnostics_screen';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import { DIAGNOSTIC_STEPS } from './accessible_controller_diagnostic_screen';

let apiMock: ApiMock;

function renderScreen(props: Partial<DiagnosticsScreenProps> = {}) {
  return render(
    provideApi(
      apiMock,
      <MemoryRouter>
        <DiagnosticsScreen onBackButtonPress={jest.fn()} {...props} />
      </MemoryRouter>
    )
  );
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2022-03-23T11:23:00.000'));
  apiMock = createApiMock();
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
  apiMock.expectGetElectionDefinition(null);
  apiMock.expectGetElectionState();
  apiMock.setBatteryInfo({ level: 0.5, discharging: true });
  apiMock.expectGetApplicationDiskSpaceSummary();
  apiMock.expectGetIsAccessibleControllerInputDetected();
  apiMock.expectGetMostRecentAccessibleControllerDiagnostic();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

// screen contents fully tested in libs/ui
test('data from API is passed to screen contents', async () => {
  apiMock.mockApiClient.getApplicationDiskSpaceSummary.reset();
  apiMock.expectGetApplicationDiskSpaceSummary({
    available: 1_000_000,
    used: 1_000_000,
    total: 2_000_000,
  });
  apiMock.mockApiClient.getMostRecentAccessibleControllerDiagnostic.reset();
  apiMock.expectGetMostRecentAccessibleControllerDiagnostic({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
    timestamp: new Date('2022-03-23T11:00:00.000').getTime(),
  });

  renderScreen();

  await screen.findByText('Battery Level: 50%');
  screen.getByText('Power Source: Battery');
  screen.getByText('Free Disk Space: 50% (1 GB / 2 GB)');

  screen.getByText('Detected');
  screen.getByText('Test passed, 3/23/2022, 11:00:00 AM');
});

test('accessible controller diagnostic - pass', async () => {
  renderScreen();

  userEvent.click(await screen.findButton('Test Accessible Controller'));

  screen.getByRole('heading', { name: 'Accessible Controller Test' });

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
  });
  apiMock.expectGetMostRecentAccessibleControllerDiagnostic({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });
  for (const [i, step] of DIAGNOSTIC_STEPS.entries()) {
    await screen.findByText(`Step ${i + 1} of ${DIAGNOSTIC_STEPS.length}`);
    screen.getByText(`${i + 1}. Press the ${step.label.toLowerCase()} button.`);
    const illustration = screen
      .getByTitle('Accessible Controller Illustration')
      .closest('svg') as unknown as HTMLElement;
    const element = within(illustration).getByTestId(step.button);
    expect(element).toHaveClass(
      MARK_SCAN_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME
    );
    screen.getButton(`${step.label} Button is Not Working`);
    fireEvent.keyDown(illustration, { key: step.key });
  }

  screen.getByRole('heading', { name: 'System Diagnostics' });
  await screen.findByText('Test passed, 3/23/2022, 11:23:00 AM');
});

test('accessible controller diagnostic - cancel', async () => {
  renderScreen();

  userEvent.click(await screen.findButton('Test Accessible Controller'));

  userEvent.click(await screen.findButton('Cancel Test'));
  screen.getByRole('heading', { name: 'System Diagnostics' });
});

test('accessible controller diagnostic - fail', async () => {
  renderScreen();

  userEvent.click(await screen.findButton('Test Accessible Controller'));

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-scan-accessible-controller',
    outcome: 'fail',
    message: 'up button is not working.',
  });
  apiMock.expectGetMostRecentAccessibleControllerDiagnostic({
    type: 'mark-scan-accessible-controller',
    outcome: 'fail',
    message: 'up button is not working.',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });
  userEvent.click(await screen.findButton('Up Button is Not Working'));

  screen.getByRole('heading', { name: 'System Diagnostics' });
  await screen.findByText(
    'Test failed, 3/23/2022, 11:23:00 AM — up button is not working.'
  );
});

test('election information', async () => {
  apiMock.mockApiClient.getElectionDefinition.reset();
  apiMock.expectGetElectionDefinition(electionTwoPartyPrimaryDefinition);
  apiMock.mockApiClient.getElectionState.reset();
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  renderScreen();

  await screen.findByText(/Example Primary Election/);
  await screen.findByText(/All Precincts/);
});

test('saving report', async () => {
  renderScreen();

  userEvent.click(await screen.findButton('Save Readiness Report'));
  apiMock.mockApiClient.saveReadinessReport
    .expectCallWith()
    .resolves(ok(['mock-file.pdf']));
  userEvent.click(await screen.findButton('Save'));
  await screen.findByText('Readiness Report Saved');
  screen.getByText(/mock-file.pdf/);
  userEvent.click(await screen.findButton('Close'));

  // confirm modal resets after exiting
  userEvent.click(
    await screen.findButton('Save Readiness Report', {
      useSparinglyIncludeHidden: true,
    })
  );
  await screen.findByRole('heading', { name: 'Save Readiness Report' });
});