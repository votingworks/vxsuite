import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import {
  MARK_SCAN_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME,
  expectDetected,
  expectDiagnosticResult,
  mockUsbDriveStatus,
  DiagnosticSectionTitle,
} from '@votingworks/ui';
import { ok } from '@votingworks/basics';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  fireEvent,
  render,
  screen,
  within,
} from '../../../test/react_testing_library';
import {
  DiagnosticsScreen,
  DiagnosticsScreenProps,
} from './diagnostics_screen';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../../test/helpers/mock_api_client';
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
  apiMock.setIsPatDeviceConnected(true);
  apiMock.expectGetMostRecentDiagnostic('mark-scan-accessible-controller');
  apiMock.expectGetMostRecentDiagnostic('mark-scan-paper-handler');
  apiMock.expectGetMostRecentDiagnostic('mark-scan-pat-input');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

// screen contents fully tested in libs/ui
test('data from API is passed to screen contents', async () => {
  apiMock.mockApiClient.getMostRecentDiagnostic.reset();
  apiMock.mockApiClient.getApplicationDiskSpaceSummary.reset();
  apiMock.expectGetApplicationDiskSpaceSummary({
    available: 1_000_000,
    used: 1_000_000,
    total: 2_000_000,
  });
  apiMock.expectGetMostRecentDiagnostic('mark-scan-accessible-controller', {
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
    timestamp: new Date('2022-03-23T11:00:00.000').getTime(),
  });
  apiMock.expectGetMostRecentDiagnostic('mark-scan-paper-handler', {
    type: 'mark-scan-paper-handler',
    outcome: 'pass',
    timestamp: new Date('2022-03-23T11:05:00.000').getTime(),
  });
  apiMock.expectGetMostRecentDiagnostic('mark-scan-pat-input', {
    type: 'mark-scan-pat-input',
    outcome: 'pass',
    timestamp: new Date('2022-03-23T11:10:00.000').getTime(),
  });

  renderScreen();

  await screen.findByText('Battery Level: 50%');

  screen.getByText('Power Source: Battery');
  screen.getByText('Free Disk Space: 50% (1 GB / 2 GB)');

  expectDetected(screen, DiagnosticSectionTitle.PaperHandler, true);
  expectDetected(screen, DiagnosticSectionTitle.AccessibleController, true);
  expectDetected(screen, DiagnosticSectionTitle.PatInput, true);
  screen.getByText('Test passed, 3/23/2022, 11:10:00 AM');
  screen.getByText('Test passed, 3/23/2022, 11:05:00 AM');
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
  apiMock.expectGetMostRecentDiagnostic('mark-scan-accessible-controller', {
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
  apiMock.expectGetMostRecentDiagnostic('mark-scan-accessible-controller', {
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
  userEvent.click(await screen.findButton('Save Readiness Report'));
  await screen.findByRole('heading', { name: 'Save Readiness Report' });
});

test('pressing the button to start the paper handler diagnostic calls the right mutation', async () => {
  apiMock.expectStartPaperHandlerDiagnostic();

  renderScreen();

  userEvent.click(await screen.findButton('Test Printer/Scanner'));
  apiMock.setPaperHandlerState('paper_handler_diagnostic.prompt_for_paper');
  await screen.findByText('Please insert a sheet of ballot paper.');
});

test('ending paper handler diagnostic refetches the diagnostic record', async () => {
  apiMock.expectStartPaperHandlerDiagnostic();

  renderScreen();
  userEvent.click(await screen.findButton('Test Printer/Scanner'));

  apiMock.setPaperHandlerState('paper_handler_diagnostic.success');

  apiMock.expectGetMostRecentDiagnostic('mark-scan-paper-handler', {
    type: 'mark-scan-paper-handler',
    outcome: 'pass',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });
  userEvent.click(await screen.findButton('Complete Test'));

  await screen.findByText(/Test passed/);
  expectDiagnosticResult(screen, DiagnosticSectionTitle.PaperHandler, true);
});

test('PAT diagnostic success', async () => {
  renderScreen();

  userEvent.click(await screen.findButton('Test PAT Input (Sip & Puff)'));
  apiMock.setPaperHandlerState('pat_device_connected');
  await screen.findByText(
    'Personal Assistive Technology Device Identification'
  );

  // Continue past intructions
  userEvent.keyboard('1');

  // Identify first input
  userEvent.keyboard('1');
  userEvent.keyboard('1');

  // Identify second input
  userEvent.keyboard('2');
  userEvent.keyboard('2');

  screen.getByText('Device Inputs Identified');

  screen.getByText(
    'You may end the diagnostic test or go back to the previous screen.'
  );

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-scan-pat-input',
    outcome: 'pass',
  });
  apiMock.expectGetMostRecentDiagnostic('mark-scan-pat-input');
  apiMock.expectSetPatDeviceIsCalibrated();
  userEvent.click(screen.getByText('Done'));
});

test('PAT diagnostic early exit', async () => {
  renderScreen();

  userEvent.click(await screen.findButton('Test PAT Input (Sip & Puff)'));
  apiMock.setPaperHandlerState('pat_device_connected');
  await screen.findByText(
    'Personal Assistive Technology Device Identification'
  );

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-scan-pat-input',
    outcome: 'fail',
    message: 'Test was ended early.',
  });
  apiMock.expectGetMostRecentDiagnostic('mark-scan-pat-input');
  apiMock.expectSetPatDeviceIsCalibrated();

  userEvent.click(screen.getByText('Skip Identification'));
});
