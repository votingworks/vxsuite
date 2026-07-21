import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { mockUsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { screen, within } from '../../test/react_testing_library';
import {
  BatchHistoryScreen,
  BatchHistoryScreenProps,
} from './batch_history_screen';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/api';
import { mockBatch, mockStatus } from '../../test/fixtures';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(props: Partial<BatchHistoryScreenProps> = {}) {
  const status = props.status ?? mockStatus();
  // the Save CVRs button fetches scan status itself
  if (props.canDeleteBatches !== false && status.batches.length > 0) {
    apiMock.setStatus(status);
  }
  return renderInAppContext(
    <BatchHistoryScreen status={status} canDeleteBatches {...props} />,
    { apiMock }
  );
}

test('shows a message when no batches have been saved', () => {
  renderScreen();
  screen.getByText('No batches have been saved');
  expect(
    screen.queryByRole('button', { name: 'Delete All Batches' })
  ).not.toBeInTheDocument();
});

test('shows summary totals and each batch with its send status', async () => {
  apiMock.setCvrSyncStatus({
    state: 'syncing',
    unsentBatchCount: 2,
    currentBatch: {
      batchId: 'b',
      label: 'Batch 2',
      sheetsSent: 1,
      sheetsTotal: 3,
    },
  });
  const status: ScanStatus = mockStatus({
    batches: [
      mockBatch({
        id: 'a',
        batchNumber: 1,
        label: 'Batch 1',
        sentToAdminAt: new Date(0).toISOString(),
      }),
      mockBatch({ id: 'b', batchNumber: 2, label: 'Batch 2', count: 3 }),
      mockBatch({ id: 'c', batchNumber: 3, label: 'Batch 3' }),
    ],
  });
  renderScreen({ status });

  await screen.findByText(hasTextAcrossElements('Total Batches: 3'));
  screen.getByText(hasTextAcrossElements('Total Sheets: 5'));

  await screen.findByText('Sending…');
  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(4); // header + 3 batches
  within(rows[0]).getByText('Sent At');
  // started at, finished at, and sent at timestamps
  expect(within(rows[1]).getAllByText(/1969-12-31/)).toHaveLength(3);
  within(rows[2]).getByText('Sending…');
  within(rows[3]).getByText('Waiting to send');
});

test('poll workers see no CVR or delete controls', () => {
  renderScreen({
    status: mockStatus({ batches: [mockBatch()] }),
    canDeleteBatches: false,
  });
  screen.getByText('Batch 1');
  expect(screen.queryByText('Save CVRs')).not.toBeInTheDocument();
  expect(screen.queryByText('Delete All Batches')).not.toBeInTheDocument();
});

test('Save CVRs opens the export modal', async () => {
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
  renderScreen({ status: mockStatus({ batches: [mockBatch()] }) });
  userEvent.click(await screen.findButton('Save CVRs'));
  await screen.findByRole('heading', { name: 'Save CVRs' });
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
