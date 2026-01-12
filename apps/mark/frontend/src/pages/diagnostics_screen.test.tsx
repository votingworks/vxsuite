import { afterEach, beforeEach, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus, Keybinding } from '@votingworks/ui';
import { fireEvent, render, screen } from '../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import {
  DiagnosticsScreen,
  DiagnosticsScreenProps,
} from './diagnostics_screen';

let apiMock: ApiMock;

function renderScreen(props: Partial<DiagnosticsScreenProps> = {}) {
  return render(
    provideApi(
      apiMock,
      <MemoryRouter>
        <DiagnosticsScreen onBackButtonPress={vi.fn()} {...props} />
      </MemoryRouter>
    )
  );
}

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2022-03-23T11:23:00.000'),
  });
  apiMock = createApiMock();
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
  apiMock.expectGetMostRecentDiagnostic('mark-accessible-controller');
  apiMock.expectGetMostRecentDiagnostic('mark-pat-input');
  apiMock.expectGetMostRecentDiagnostic('mark-headphone-input');
  apiMock.expectGetMostRecentDiagnostic('mark-system-audio');
  apiMock.expectGetMostRecentDiagnostic('mark-barcode-reader');
  apiMock.expectGetMostRecentDiagnostic('uninterruptible-power-supply');
  apiMock.expectGetMostRecentDiagnostic('test-print');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders diagnostics screen with all sections', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  await screen.findByRole('heading', { name: 'System Diagnostics' });
  screen.getByRole('button', { name: 'Back' });
  screen.getByRole('button', { name: 'Save Readiness Report' });
  screen.getByText('Accessible Controller');
  screen.getByText('PAT Input');
  screen.getByText('Headphone Input');
  screen.getByText('System Audio');
  screen.getByText('Barcode Reader');
  screen.getByText('Uninterruptible Power Supply');
  screen.getByText('Printer');
  screen.getByText('Storage');
  screen.getByText('Save Readiness Report');
  screen.getByText(/Free Disk Space: 50%/);
  screen.getByText(/1000 GB/);
  screen.getByText(/2000 GB/);
  screen.getByText('No election loaded on device');
});

test('navigating to and from system audio diagnostic - pass', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'Test System Audio' })
  );
  await screen.findByRole('heading', { name: 'System Audio Test' });

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-system-audio',
    outcome: 'pass',
  });
  apiMock.expectGetMostRecentDiagnostic('mark-system-audio', {
    type: 'mark-system-audio',
    outcome: 'pass',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });

  userEvent.click(screen.getByRole('button', { name: 'Sound Is Audible' }));
  await screen.findByRole('heading', { name: 'System Diagnostics' });
  await screen.findByText(/System Audio test passed/);
});

test('navigating to and from system audio diagnostic - fail', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'Test System Audio' })
  );
  await screen.findByRole('heading', { name: 'System Audio Test' });

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-system-audio',
    outcome: 'fail',
  });
  apiMock.expectGetMostRecentDiagnostic('mark-system-audio', {
    type: 'mark-system-audio',
    outcome: 'fail',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });

  userEvent.click(screen.getByRole('button', { name: 'Sound Is Not Audible' }));
  await screen.findByRole('heading', { name: 'System Diagnostics' });
  await screen.findByText(/System Audio test failed/);
});

test('navigating to and from system audio diagnostic - cancel', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'Test System Audio' })
  );
  await screen.findByRole('heading', { name: 'System Audio Test' });

  userEvent.click(screen.getByRole('button', { name: 'Cancel Test' }));
  await screen.findByRole('heading', { name: 'System Diagnostics' });
});

test('navigating to and from headphone input diagnostic - pass', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'Test Headphone Input' })
  );
  await screen.findByRole('heading', { name: 'Headphone Input Test' });

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-headphone-input',
    outcome: 'pass',
  });
  apiMock.expectGetMostRecentDiagnostic('mark-headphone-input', {
    type: 'mark-headphone-input',
    outcome: 'pass',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });

  userEvent.click(screen.getByRole('button', { name: 'Sound Is Audible' }));
  await screen.findByRole('heading', { name: 'System Diagnostics' });
  await screen.findByText(/Headphone Input test passed/);
});

test('navigating to and from headphone input diagnostic - fail', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'Test Headphone Input' })
  );
  await screen.findByRole('heading', { name: 'Headphone Input Test' });

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-headphone-input',
    outcome: 'fail',
  });
  apiMock.expectGetMostRecentDiagnostic('mark-headphone-input', {
    type: 'mark-headphone-input',
    outcome: 'fail',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });

  userEvent.click(screen.getByRole('button', { name: 'Sound Is Not Audible' }));
  await screen.findByRole('heading', { name: 'System Diagnostics' });
  await screen.findByText(/Headphone Input test failed/);
});

test('navigating to and from headphone input diagnostic - cancel', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'Test Headphone Input' })
  );
  await screen.findByRole('heading', { name: 'Headphone Input Test' });

  userEvent.click(screen.getByRole('button', { name: 'Cancel Test' }));
  await screen.findByRole('heading', { name: 'System Diagnostics' });
});

test('navigating to and from PAT input diagnostic - pass', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'Test PAT Input' })
  );
  await screen.findByText('Personal Assistive Technology Input Test');

  // Continue past instructions
  fireEvent.keyDown(document, { key: Keybinding.PAT_MOVE });

  // Identify first input
  fireEvent.keyDown(document, { key: Keybinding.PAT_MOVE });
  fireEvent.keyDown(document, { key: Keybinding.PAT_MOVE });

  // Identify second input
  fireEvent.keyDown(document, { key: Keybinding.PAT_SELECT });
  fireEvent.keyDown(document, { key: Keybinding.PAT_SELECT });

  await screen.findByText('Test Passed');

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-pat-input',
    outcome: 'pass',
  });
  apiMock.expectGetMostRecentDiagnostic('mark-pat-input', {
    type: 'mark-pat-input',
    outcome: 'pass',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });
  userEvent.click(screen.getByRole('button', { name: 'Exit' }));

  await screen.findByRole('heading', { name: 'System Diagnostics' });
  await screen.findByText(/PAT Input test passed/);
});

test('navigating to and from PAT input diagnostic - cancel', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'Test PAT Input' })
  );
  await screen.findByText('Personal Assistive Technology Input Test');

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-pat-input',
    outcome: 'fail',
    message: 'Test was ended early.',
  });
  apiMock.expectGetMostRecentDiagnostic('mark-pat-input', {
    type: 'mark-pat-input',
    outcome: 'fail',
    message: 'Test was ended early.',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });

  userEvent.click(screen.getByRole('button', { name: 'Cancel Test' }));
  await screen.findByRole('heading', { name: 'System Diagnostics' });
});

test('navigating to and from barcode reader diagnostic - fail', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  apiMock.expectClearLastBarcodeScan();
  apiMock.expectGetMostRecentBarcodeScan(null);

  userEvent.click(
    await screen.findByRole('button', { name: 'Test Barcode Reader' })
  );
  await screen.findByRole('heading', { name: 'Barcode Reader Test' });
  screen.getByText('Waiting for barcode scan...');

  apiMock.expectAddDiagnosticRecord({
    type: 'mark-barcode-reader',
    outcome: 'fail',
  });
  apiMock.expectGetMostRecentDiagnostic('mark-barcode-reader', {
    type: 'mark-barcode-reader',
    outcome: 'fail',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });

  userEvent.click(
    screen.getByRole('button', { name: 'Barcode Reader Is Not Working' })
  );
  await screen.findByRole('heading', { name: 'System Diagnostics' });
  await screen.findByText(/Barcode Reader test failed/);
});

test('navigating to and from barcode reader diagnostic - cancel', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  apiMock.expectClearLastBarcodeScan();
  apiMock.expectGetMostRecentBarcodeScan(null);

  userEvent.click(
    await screen.findByRole('button', { name: 'Test Barcode Reader' })
  );
  await screen.findByRole('heading', { name: 'Barcode Reader Test' });

  userEvent.click(screen.getByRole('button', { name: 'Cancel Test' }));
  await screen.findByRole('heading', { name: 'System Diagnostics' });
});

test('UPS diagnostic - pass', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  userEvent.click(
    await screen.findByRole('button', {
      name: 'Test Uninterruptible Power Supply',
    })
  );
  await screen.findByText(
    'Is the uninterruptible power supply connected and fully charged?'
  );

  apiMock.expectLogUpsDiagnosticOutcome('pass');
  apiMock.expectGetMostRecentDiagnostic('uninterruptible-power-supply', {
    type: 'uninterruptible-power-supply',
    outcome: 'pass',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });

  userEvent.click(screen.getByRole('button', { name: 'Yes' }));
  await screen.findByRole('heading', { name: 'System Diagnostics' });
});

test('UPS diagnostic - fail', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
  apiMock.mockApiClient.getElectionState.expectCallWith().resolves({
    precinctSelection: undefined,
    pollsState: 'polls_closed_initial',
    ballotsPrintedCount: 0,
    isTestMode: true,
  });
  apiMock.mockApiClient.getDiskSpaceSummary.expectCallWith().resolves({
    available: 1_000_000_000,
    used: 1_000_000_000,
    total: 2_000_000_000,
  });

  renderScreen();

  userEvent.click(
    await screen.findByRole('button', {
      name: 'Test Uninterruptible Power Supply',
    })
  );
  await screen.findByText(
    'Is the uninterruptible power supply connected and fully charged?'
  );

  apiMock.expectLogUpsDiagnosticOutcome('fail');
  apiMock.expectGetMostRecentDiagnostic('uninterruptible-power-supply', {
    type: 'uninterruptible-power-supply',
    outcome: 'fail',
    timestamp: new Date('2022-03-23T11:23:00.000').getTime(),
  });

  userEvent.click(screen.getByRole('button', { name: 'No' }));
  await screen.findByRole('heading', { name: 'System Diagnostics' });
});
