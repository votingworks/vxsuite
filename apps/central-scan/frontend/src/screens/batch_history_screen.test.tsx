import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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

test('shows a sent-to-VxAdmin column when networking is enabled', async () => {
  apiMock.setNetworkStatus({
    isEnabled: true,
    connection: {
      status: 'online-host-detected',
      hostMachineId: '0002',
      hostAddress: 'http://169.254.10.20:3002',
    },
  });
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
  await screen.findByText('Sent At');
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent('Batch 1');
  expect(rows[0]).not.toHaveTextContent('Not sent');
  expect(rows[1]).toHaveTextContent('Not sent');
});

test('shows a failed batch with a retry button', async () => {
  apiMock.setNetworkStatus({
    isEnabled: true,
    connection: {
      status: 'online-host-detected',
      hostMachineId: '0002',
      hostAddress: 'http://169.254.10.20:3002',
    },
  });
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

  apiMock.apiClient.retrySendBatchToAdmin
    .expectCallWith({ batchId: 'failed-batch' })
    .resolves();
  userEvent.click(screen.getButton('Retry'));
  await vi.waitFor(() => apiMock.assertComplete());
});

test('shows a batch waiting to retry as sending', async () => {
  apiMock.setNetworkStatus({
    isEnabled: true,
    connection: {
      status: 'online-host-detected',
      hostMachineId: '0002',
      hostAddress: 'http://169.254.10.20:3002',
    },
  });
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
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent('Sending…');
  expect(rows[1]).toHaveTextContent('Not sent');
});

test('shows a batch removed from VxAdmin with a resend button', async () => {
  apiMock.setNetworkStatus({
    isEnabled: true,
    connection: {
      status: 'online-host-detected',
      hostMachineId: '0002',
      hostAddress: 'http://169.254.10.20:3002',
    },
  });
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
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows[0]).not.toHaveTextContent('Removed from VxAdmin');
  expect(rows[1]).toHaveTextContent('Removed from VxAdmin');

  apiMock.apiClient.resendBatchToAdmin
    .expectCallWith({ batchId: 'removed' })
    .resolves();
  userEvent.click(screen.getButton('Resend'));
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

test('hides the sent-to-VxAdmin column when networking is disabled', () => {
  const status: ScanStatus = mockStatus({
    batches: [mockBatch({ id: 'a' })],
  });
  renderScreen({ status });
  expect(screen.queryByText('Sent At')).not.toBeInTheDocument();
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
  userEvent.click(screen.getButton('Delete All Batches'));

  // progress message
  await screen.findByText('Deleting Batches');
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
