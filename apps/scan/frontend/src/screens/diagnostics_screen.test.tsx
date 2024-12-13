import { vi, beforeEach, afterEach, test, expect } from 'vitest';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import { render, screen, waitFor } from '../../test/react_testing_library';
import { DiagnosticsScreen } from './diagnostics_screen';

let apiMock: ApiMock;

function renderScreen({
  onClose = vi.fn(),
}: {
  onClose?: VoidFunction;
} = {}) {
  render(provideApi(apiMock, <DiagnosticsScreen onClose={onClose} />));
}

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);
  apiMock.setPrinterStatusV4({ state: 'idle' });
  apiMock.expectGetUsbDriveStatus('mounted');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders provided information', async () => {
  apiMock.expectGetDiskSpaceSummary({
    available: 99.2 * 1_000_000,
    used: 0.08 * 1_000_000,
    total: 100 * 1_000_000,
  });
  apiMock.expectGetMostRecentScannerDiagnostic();
  apiMock.expectGetMostRecentAudioDiagnostic();
  apiMock.expectGetMostRecentPrinterDiagnostic();
  apiMock.expectGetConfig({
    electionDefinition: readElectionTwoPartyPrimaryDefinition(),
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
  });

  renderScreen();
  await screen.findByText('Configuration');
  screen.getByText(/Election: Example Primary Election/);
  screen.getByText('Precinct: Precinct 1');
  screen.getByText('Ballot Styles: 1M, 2F');

  screen.getByText('Free Disk Space: 99% (99.2 GB / 100 GB)');

  screen.getByText('The scanner is connected.');
  screen.getByText('No test scan on record');

  screen.getByText('The printer is loaded with paper and ready to print.');
  screen.getByText('No test print on record');
});

test('renders scanner status and diagnostic result', async () => {
  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentScannerDiagnostic({
    type: 'blank-sheet-scan',
    outcome: 'fail',
    timestamp: new Date('2024-01-01T00:00:00').getTime(),
  });
  apiMock.expectGetMostRecentAudioDiagnostic();
  apiMock.expectGetMostRecentPrinterDiagnostic();
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus({ state: 'disconnected', ballotsCounted: 0 });

  renderScreen();

  await screen.findByText(
    'The scanner is disconnected. Please contact support.'
  );
  screen.getByText('Test scan failed, 1/1/2024, 12:00:00 AM');
});

test('renders current printer status and diagnostic result', async () => {
  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentScannerDiagnostic();
  apiMock.expectGetMostRecentAudioDiagnostic();
  apiMock.expectGetMostRecentPrinterDiagnostic({
    type: 'test-print',
    outcome: 'fail',
    timestamp: new Date('2024-01-01T00:00:00').getTime(),
    message: 'Ran out of paper.',
  });
  apiMock.expectGetConfig();
  apiMock.setPrinterStatusV4({ state: 'no-paper' });

  renderScreen();

  await screen.findByText('The printer is not loaded with paper.');
  screen.getByText(
    'Test print failed, 1/1/2024, 12:00:00 AM — Ran out of paper.'
  );
  expect(screen.getButton('Perform Test Scan')).toBeDisabled();
});

test('renders audio diagnostic result', async () => {
  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentScannerDiagnostic();
  apiMock.expectGetMostRecentAudioDiagnostic({
    message: 'This is a Quiet Place.',
    outcome: 'fail',
    timestamp: new Date('2024-01-01T00:00:00').getTime(),
    type: 'scan-audio',
  });
  apiMock.expectGetMostRecentPrinterDiagnostic();
  apiMock.expectGetConfig();
  apiMock.setPrinterStatusV4({ state: 'no-paper' });

  renderScreen();

  await screen.findByText(
    'Sound test failed, 1/1/2024, 12:00:00 AM — This is a Quiet Place.'
  );
});

test('can run scanner diagnostic flow', async () => {
  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentScannerDiagnostic();
  apiMock.expectGetMostRecentAudioDiagnostic();
  apiMock.expectGetMostRecentPrinterDiagnostic();
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus({ state: 'paused', ballotsCounted: 0 });

  renderScreen();

  await waitFor(() => {
    expect(screen.getButton('Perform Test Scan')).toBeEnabled();
  });
  apiMock.mockApiClient.beginScannerDiagnostic.expectCallWith().resolves();
  userEvent.click(screen.getButton('Perform Test Scan'));

  apiMock.expectGetScannerStatus({
    state: 'scanner_diagnostic.running',
    ballotsCounted: 0,
  });
  await screen.findByRole('heading', { name: 'Scanner Diagnostic' });
  screen.getByRole('heading', { name: 'Insert Blank Sheet' });

  apiMock.expectGetScannerStatus({
    state: 'scanner_diagnostic.done',
    ballotsCounted: 0,
  });
  await screen.findByText('Test Scan Successful');

  apiMock.mockApiClient.endScannerDiagnostic.expectCallWith().resolves();
  apiMock.expectGetScannerStatus({
    state: 'paused',
    ballotsCounted: 0,
  });
  apiMock.expectGetMostRecentScannerDiagnostic({
    type: 'blank-sheet-scan',
    outcome: 'pass',
    timestamp: new Date('2024-01-01T00:00:00').getTime(),
  });
  userEvent.click(screen.getButton('Close'));

  await screen.findByText('Test scan successful, 1/1/2024, 12:00:00 AM');
});

test('can enter load paper flow and print test page flow', async () => {
  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentScannerDiagnostic();
  apiMock.expectGetMostRecentAudioDiagnostic();
  apiMock.expectGetMostRecentPrinterDiagnostic();
  apiMock.expectGetConfig();

  renderScreen();

  // can enter loading flow
  userEvent.click(await screen.findButton('Load Paper'));
  await screen.findByText('Remove Paper Roll Holder');
  userEvent.click(screen.getButton('Cancel'));

  // can enter test print flow
  apiMock.expectGetMostRecentPrinterDiagnostic();
  apiMock.expectPrintTestPage().resolve();
  userEvent.click(await screen.findButton('Print Test Page'));
  await screen.findByText('Test Page Printed');
});

test('can save readiness report', async () => {
  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentScannerDiagnostic();
  apiMock.expectGetMostRecentAudioDiagnostic();
  apiMock.expectGetMostRecentPrinterDiagnostic();
  apiMock.expectGetConfig();
  apiMock.expectSaveReadinessReport();

  renderScreen();

  userEvent.click(await screen.findButton('Save Readiness Report'));
  await screen.findByText(
    'The readiness report will be saved to the inserted USB drive.'
  );
  userEvent.click(screen.getButton('Save'));
  await screen.findByText('Readiness Report Saved');
  screen.getByText(/report.pdf/);
  userEvent.click(await screen.findButton('Close'));

  // confirm modal resets after exiting
  userEvent.click(await screen.findButton('Save Readiness Report'));
  await screen.findByRole('heading', { name: 'Save Readiness Report' });
});
