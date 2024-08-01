import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import { render, screen } from '../../test/react_testing_library';
import { DiagnosticsScreen } from './diagnostics_screen';

let apiMock: ApiMock;

function renderScreen({
  onClose = jest.fn(),
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
  apiMock.expectGetMostRecentPrinterDiagnostic();
  apiMock.expectGetConfig({
    electionDefinition: electionTwoPartyPrimaryDefinition,
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
  });

  renderScreen();
  await screen.findByText('Configuration');
  screen.getByText(/Election: Example Primary Election/);
  screen.getByText('Precinct: Precinct 1');
  screen.getByText('Ballot Styles: 1M, 2F');

  screen.getByText('Free Disk Space: 99% (99.2 GB / 100 GB)');

  screen.getByText('The printer is loaded with paper and ready to print.');
  screen.getByText('No test print on record');
});

test('renders current printer status and diagnostic result', async () => {
  apiMock.expectGetDiskSpaceSummary();
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
});

test('can enter load paper flow and print test page flow', async () => {
  apiMock.expectGetDiskSpaceSummary();
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
  apiMock.expectGetMostRecentPrinterDiagnostic();
  apiMock.expectGetConfig();
  apiMock.expectSaveReadinessReport();

  renderScreen();

  userEvent.click(await screen.findButton('Save Readiness Report'));
  await screen.findByText(
    'The readiness report will be saved to the mounted USB drive.'
  );
  userEvent.click(screen.getButton('Save'));
  await screen.findByText('Readiness Report Saved');
  screen.getByText(/report.pdf/);
  userEvent.click(await screen.findButton('Close'));

  // confirm modal resets after exiting
  userEvent.click(await screen.findButton('Save Readiness Report'));
  await screen.findByRole('heading', { name: 'Save Readiness Report' });
});
