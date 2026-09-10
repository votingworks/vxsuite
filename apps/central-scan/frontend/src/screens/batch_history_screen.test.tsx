import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { screen, within } from '../../test/react_testing_library.js';
import {
  BatchHistoryScreen,
  BatchHistoryScreenProps,
} from './batch_history_screen.js';
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

function renderScreen(props?: Partial<BatchHistoryScreenProps>) {
  return renderInAppContext(
    <BatchHistoryScreen status={mockStatus()} {...props} />,
    { apiMock }
  );
}

function enableNetworking() {
  apiMock.setNetworkStatus({
    isEnabled: true,
    connection: {
      status: 'online-host-detected',
      hostMachineId: '0002',
      hostAddress: 'http://169.254.10.20:3002',
    },
  });
}

function getBatchRows() {
  return screen.getAllByRole('row').slice(1);
}

test('null state', () => {
  renderScreen();
  screen.getByText('No ballots have been scanned');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryButton('Save CVRs')).not.toBeInTheDocument();
  expect(screen.queryButton('Delete All Batches')).not.toBeInTheDocument();
});

test('shows totals and a row for each batch', () => {
  const status: ScanStatus = mockStatus({
    batches: [
      mockBatch({
        id: 'a',
        label: 'Batch 1',
        count: 1,
        endedAt: new Date(2026, 7, 25, 10, 5).toISOString(),
      }),
      mockBatch({ id: 'b', label: 'Batch 2', count: 3 }),
    ],
  });
  renderScreen({ status });
  expect(screen.getByTestId('total-batches')).toHaveTextContent('2');
  expect(screen.getByTestId('total-sheets')).toHaveTextContent('4');

  screen.getByRole('columnheader', { name: 'Batch' });
  screen.getByRole('columnheader', { name: 'Sheets' });
  screen.getByRole('columnheader', { name: 'Timestamp' });
  expect(
    screen.queryByRole('columnheader', { name: 'VxAdmin Sync' })
  ).not.toBeInTheDocument();

  const rows = getBatchRows();
  expect(rows).toHaveLength(2);
  within(rows[0]).getByText('Batch 1');
  within(rows[0]).getByText('1');
  within(rows[0]).getByText('2026-08-25 10:05:00');
  within(rows[1]).getByText('Batch 2');
  within(rows[1]).getByText('3');
});

test('shows a VxAdmin sync column when networking is enabled', async () => {
  enableNetworking();
  const status: ScanStatus = mockStatus({
    batches: [
      mockBatch({
        id: 'sent',
        label: 'Batch 1',
        sentToAdminAt: new Date(2026, 7, 25, 10, 0).toISOString(),
      }),
      mockBatch({ id: 'unsent', label: 'Batch 2' }),
    ],
  });
  renderScreen({ status });
  await screen.findByRole('columnheader', { name: 'VxAdmin Sync' });
  const rows = getBatchRows();
  within(rows[0]).getByText('Sent');
  expect(within(rows[0]).queryByText('Not sent')).not.toBeInTheDocument();
  within(rows[1]).getByText('Not sent');
  expect(within(rows[1]).queryByText('Sent')).not.toBeInTheDocument();
});

test('shows a failed batch with a retry button', async () => {
  enableNetworking();
  const status: ScanStatus = mockStatus({
    batches: [
      mockBatch({
        id: 'failed-batch',
        label: 'Batch 1',
        sendToAdminError: 'sending failed 5 times in a row',
      }),
    ],
  });
  renderScreen({ status });
  await screen.findByText('Send failed');
  const [row] = getBatchRows();

  apiMock.apiClient.retrySendBatchToAdmin
    .expectCallWith({ batchId: 'failed-batch' })
    .resolves();
  userEvent.click(within(row).getButton('Retry'));
  await vi.waitFor(() => apiMock.assertComplete());
});

test('shows a batch waiting to retry as sending', async () => {
  enableNetworking();
  const status: ScanStatus = mockStatus({
    batches: [
      mockBatch({
        id: 'retrying',
        label: 'Batch 1',
        isSendingToAdmin: true,
      }),
      mockBatch({ id: 'queued', label: 'Batch 2' }),
    ],
  });
  renderScreen({ status });
  await screen.findByText('Sending…');
  const rows = getBatchRows();
  expect(rows[0]).toHaveTextContent('Sending…');
  expect(rows[1]).toHaveTextContent('Not sent');
});

test('shows a batch removed from VxAdmin with a resend button', async () => {
  enableNetworking();
  const sentAt = new Date(2026, 7, 25, 10, 0).toISOString();
  const status: ScanStatus = mockStatus({
    batches: [
      mockBatch({
        id: 'still-on-admin',
        label: 'Batch 1',
        sentToAdminAt: sentAt,
      }),
      mockBatch({
        id: 'removed',
        label: 'Batch 2',
        sentToAdminAt: sentAt,
        removedFromAdminAt: sentAt,
      }),
    ],
  });
  renderScreen({ status });
  await screen.findByText('Removed from VxAdmin');
  const rows = getBatchRows();
  within(rows[0]).getByText('Sent');
  expect(within(rows[0]).queryButton('Resend')).not.toBeInTheDocument();
  within(rows[1]).getByText('Removed from VxAdmin');
  expect(within(rows[1]).queryByText('Sent')).not.toBeInTheDocument();

  apiMock.apiClient.resendBatchToAdmin
    .expectCallWith({ batchId: 'removed' })
    .resolves();
  userEvent.click(within(rows[1]).getButton('Resend'));
  await vi.waitFor(() => apiMock.assertComplete());
});

test.each([
  {
    hostCvrFileMode: 'official' as const,
    expectedText:
      /is tabulating official results, but this machine is in test ballot mode/,
  },
  {
    hostCvrFileMode: 'test' as const,
    expectedText:
      /is tabulating test results, but this machine is in official ballot mode/,
  },
])(
  'warns when VxAdmin is locked to $hostCvrFileMode mode',
  async ({ hostCvrFileMode, expectedText }) => {
    apiMock.setNetworkStatus({
      isEnabled: true,
      connection: {
        status: 'online-invalid-mode',
        hostMachineId: '0002',
        hostCvrFileMode,
      },
    });
    renderScreen({ status: mockStatus({ batches: [mockBatch()] }) });
    await screen.findByText(expectedText);
    screen.getByText('Not sent');
  }
);

test('warns when VxAdmin results are marked official', async () => {
  apiMock.setNetworkStatus({
    isEnabled: true,
    connection: { status: 'online-results-official', hostMachineId: '0002' },
  });
  renderScreen({ status: mockStatus({ batches: [mockBatch()] }) });
  await screen.findByText(/has marked its results official/);
});

test('hides the VxAdmin sync column when networking is disabled', () => {
  const status: ScanStatus = mockStatus({
    batches: [mockBatch({ id: 'a' })],
  });
  renderScreen({ status });
  expect(
    screen.queryByRole('columnheader', { name: 'VxAdmin Sync' })
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Not sent')).not.toBeInTheDocument();
});

test('shows whether a batch is scanning', () => {
  const status: ScanStatus = mockStatus(
    {
      batches: [
        mockBatch({
          endedAt: undefined,
        }),
      ],
    },
    { state: 'scanning', batchId: 'a' }
  );
  renderScreen({ status });
  screen.getByText('Scanning…');
  for (const deleteButton of screen.getAllButtons('Delete')) {
    expect(deleteButton).toBeDisabled();
  }
  expect(screen.getButton('Delete All Batches')).toBeDisabled();
});

test('Delete opens a confirmation for that batch', async () => {
  const status: ScanStatus = mockStatus({
    batches: [
      mockBatch({ id: 'a', label: 'Batch 1' }),
      mockBatch({ id: 'b', label: 'Batch 2' }),
    ],
  });
  renderScreen({ status });

  userEvent.click(screen.getAllButtons('Delete')[1]);
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Delete ‘Batch 2’' });
  userEvent.click(within(modal).getButton('Cancel'));
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('Save CVRs opens the export modal', async () => {
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
  renderScreen({ status: mockStatus({ batches: [mockBatch()] }) });

  userEvent.click(screen.getButton('Save CVRs'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Save CVRs' });
});

test('Delete All Batches is not allowed when canUnconfigure is false', () => {
  const status: ScanStatus = mockStatus({
    canUnconfigure: false,
    batches: [mockBatch()],
  });
  renderScreen({ status });

  userEvent.click(screen.getButton('Delete All Batches'));
  screen.getByRole('heading', { name: 'CVR Backup Required' });
  userEvent.click(screen.getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('Delete All Batches button', async () => {
  const status: ScanStatus = mockStatus({
    batches: [mockBatch()],
  });
  renderScreen({ status });

  // initial button
  userEvent.click(screen.getButton('Delete All Batches'));

  // confirmation
  apiMock.expectClearBallotData();
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Delete All Batches' });
  userEvent.click(within(modal).getButton('Delete All Batches'));

  // progress message
  await screen.findByText('Deleting Batches');
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
