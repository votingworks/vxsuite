import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { deferred } from '@votingworks/basics';
import type { BatchPauseReason } from '@votingworks/central-scan-backend';
import { screen, within } from '../../test/react_testing_library.js';
import {
  ScanBallotsScreen,
  ScanBallotsScreenProps,
} from './scan_ballots_screen.js';
import { renderInAppContext } from '../../test/render_in_app_context.js';
import { ApiMock, createApiMock } from '../../test/api.js';
import { mockBatch, mockStatus } from '../../test/fixtures.js';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(props?: Partial<ScanBallotsScreenProps>) {
  return renderInAppContext(
    <ScanBallotsScreen
      status={mockStatus()}
      isPollingPlaceUnconfigured={false}
      {...props}
    />,
    { apiMock }
  );
}

const openBatch = mockBatch({
  id: 'a',
  label: 'Batch 1',
  count: 3,
  endedAt: undefined,
});

function scanningStatus() {
  return mockStatus(
    { batches: [openBatch] },
    { state: 'scanning', batchId: 'a' }
  );
}

function pausedStatus(pauseReason: BatchPauseReason, isScannerAttached = true) {
  return mockStatus(
    { batches: [openBatch], isScannerAttached },
    { state: 'paused', batchId: 'a', pauseReason }
  );
}

test('idle, disconnected: waits for the scanner', () => {
  renderScreen({ status: mockStatus({ isScannerAttached: false }) });
  screen.getByText('Disconnected');
  screen.getByText('Connect the scanner to begin scanning.');
  expect(
    screen.queryByRole('button', { name: 'Start Scanning' })
  ).not.toBeInTheDocument();
  expect(screen.getByTestId('total-batches')).toHaveTextContent('0');
  expect(screen.getByTestId('total-sheets')).toHaveTextContent('0');
});

test('idle: Start Scanning starts a new batch', async () => {
  renderScreen({
    status: mockStatus({
      batches: [
        mockBatch({ id: 'a', count: 1 }),
        mockBatch({ id: 'b', count: 3 }),
      ],
    }),
  });
  screen.getByText('Ready to Scan');
  screen.getByText('Place ballots in the input tray');
  expect(screen.getByTestId('total-batches')).toHaveTextContent('2');
  expect(screen.getByTestId('total-sheets')).toHaveTextContent('4');

  const scanning = deferred<void>();
  apiMock.apiClient.scanBatch.expectCallWith().returns(scanning.promise);
  userEvent.click(screen.getButton('Start Scanning'));
  await vi.waitFor(() =>
    expect(screen.getButton('Start Scanning')).toBeDisabled()
  );
  scanning.resolve();
  await vi.waitFor(() =>
    expect(screen.getButton('Start Scanning')).toBeEnabled()
  );
});

test('idle: warns and disables scanning when a polling place needs to be selected', () => {
  renderScreen({ isPollingPlaceUnconfigured: true });
  screen.getByText(/No polling place selected/);
  expect(screen.getButton('Start Scanning')).toBeDisabled();
});

test('scanning: pauses on request', async () => {
  renderScreen({ status: scanningStatus(), isPollingPlaceUnconfigured: true });
  screen.getByText('Scanning');
  screen.getByText('Batch 1');
  expect(screen.getByTestId('batch-sheet-count')).toHaveTextContent('3');
  expect(
    screen.queryByText(/No polling place selected/)
  ).not.toBeInTheDocument();

  const pausing = deferred<void>();
  apiMock.apiClient.pauseBatch.expectCallWith().returns(pausing.promise);
  userEvent.click(screen.getButton('Pause Scanning'));
  await vi.waitFor(() => expect(screen.getButton('Pausing…')).toBeDisabled());
  pausing.resolve();
  await vi.waitFor(() =>
    expect(screen.getButton('Pause Scanning')).toBeEnabled()
  );
});

test('paused after the tray emptied: Save, Continue, or Discard', async () => {
  renderScreen({ status: pausedStatus({ type: 'tray-empty' }) });
  screen.getByText('Paused');
  screen.getByText('Input tray empty');
  screen.getByText('Batch 1');
  expect(screen.getByTestId('batch-sheet-count')).toHaveTextContent('3');
  screen.getButton('Save Batch');
  screen.getButton('Discard Batch');

  const resuming = deferred<void>();
  apiMock.apiClient.resumeBatch.expectCallWith().returns(resuming.promise);
  userEvent.click(screen.getButton('Continue Scanning'));
  await vi.waitFor(() =>
    expect(screen.getButton('Continue Scanning')).toBeDisabled()
  );
  expect(screen.getButton('Save Batch')).toBeDisabled();
  expect(screen.getButton('Discard Batch')).toBeDisabled();
  resuming.resolve();
  await vi.waitFor(() =>
    expect(screen.getButton('Continue Scanning')).toBeEnabled()
  );
});

test('paused manually: Continue or Discard', () => {
  renderScreen({ status: pausedStatus({ type: 'manual' }) });
  screen.getByText('Paused');
  expect(screen.queryByText('Input tray empty')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Save Batch' })
  ).not.toBeInTheDocument();
  screen.getButton('Continue Scanning');
  screen.getButton('Discard Batch');
});

test('paused after a ballot needed review: Continue or Discard', () => {
  renderScreen({ status: pausedStatus({ type: 'review', sheetId: 's' }) });
  screen.getByText('Paused');
  screen.getByText('A ballot required review');
  expect(
    screen.queryByRole('button', { name: 'Save Batch' })
  ).not.toBeInTheDocument();
  screen.getButton('Continue Scanning');
  screen.getButton('Discard Batch');
});

test('paused with the scanner disconnected: Continue is disabled', () => {
  renderScreen({ status: pausedStatus({ type: 'tray-empty' }, false) });
  screen.getByText('Disconnected');
  screen.getByText('Connect the scanner to continue scanning.');
  expect(screen.getButton('Continue Scanning')).toBeDisabled();
  expect(screen.getButton('Save Batch')).toBeEnabled();
  expect(screen.getButton('Discard Batch')).toBeEnabled();
});

test('saving a batch keeps the confirmation open until the save completes', async () => {
  renderScreen({ status: pausedStatus({ type: 'tray-empty' }) });

  userEvent.click(screen.getButton('Save Batch'));
  let modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Save Batch' });
  within(modal).getByText('All 3 sheets scanned in this batch will be saved.');
  userEvent.click(within(modal).getButton('Cancel'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Save Batch'));
  modal = await screen.findByRole('alertdialog');
  const saving = deferred<void>();
  apiMock.apiClient.saveBatch.expectCallWith().returns(saving.promise);
  userEvent.click(within(modal).getButton('Save Batch'));
  await vi.waitFor(() =>
    expect(within(modal).getButton('Save Batch')).toBeDisabled()
  );
  expect(within(modal).getButton('Cancel')).toBeDisabled();
  saving.resolve();
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('saving a batch mentions VxAdmin when networking is enabled', async () => {
  apiMock.setNetworkStatus({
    isEnabled: true,
    connection: {
      status: 'online-host-detected',
      hostMachineId: '0002',
      hostAddress: 'http://169.254.10.20:3002',
    },
  });
  renderScreen({ status: pausedStatus({ type: 'tray-empty' }) });

  userEvent.click(screen.getButton('Save Batch'));
  const modal = await screen.findByRole('alertdialog');
  await within(modal).findByText(
    'All 3 sheets scanned in this batch will be saved and sent to VxAdmin.'
  );
});

test('discarding a batch keeps the confirmation open until the discard completes', async () => {
  renderScreen({ status: pausedStatus({ type: 'manual' }) });

  userEvent.click(screen.getButton('Discard Batch'));
  let modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Discard Batch' });
  within(modal).getByText(
    'All sheets scanned in this batch will be permanently discarded.'
  );
  userEvent.click(within(modal).getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Discard Batch'));
  modal = await screen.findByRole('alertdialog');
  const discarding = deferred<void>();
  apiMock.apiClient.discardBatch.expectCallWith().returns(discarding.promise);
  userEvent.click(within(modal).getButton('Discard Batch'));
  await vi.waitFor(() =>
    expect(within(modal).getButton('Discard Batch')).toBeDisabled()
  );
  expect(within(modal).getButton('Close')).toBeDisabled();
  discarding.resolve();
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('error: Discard is the only action', async () => {
  renderScreen({
    status: mockStatus({ batches: [] }, { state: 'error', batchId: 'a' }),
  });
  screen.getByText('Error');
  screen.getByText('Discard this batch, then rescan the ballots.');
  expect(screen.getByTestId('batch-sheet-count')).toHaveTextContent('0');
  expect(
    screen.queryByRole('button', { name: 'Continue Scanning' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Pause Scanning' })
  ).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Discard Batch'));
  const modal = await screen.findByRole('alertdialog');
  apiMock.expectDiscardBatch();
  userEvent.click(within(modal).getButton('Discard Batch'));
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
