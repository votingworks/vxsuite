import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { screen, within } from '../../test/react_testing_library';
import {
  ScanBallotsScreen,
  ScanBallotsScreenProps,
} from './scan_ballots_screen';
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

function renderScreen(props?: Partial<ScanBallotsScreenProps>) {
  return renderInAppContext(
    <ScanBallotsScreen
      status={mockStatus()}
      statusIsStale={false}
      isPollingPlaceUnconfigured={false}
      {...props}
    />,
    { apiMock }
  );
}

test('warns and disables scanning when a polling place needs to be selected', () => {
  renderScreen({ isPollingPlaceUnconfigured: true });
  screen.getByText(/No polling place selected/);
  expect(screen.getButton('Scan New Batch')).toBeDisabled();
});

test('null state', () => {
  renderScreen();
  screen.getByText('Ready to scan');
  screen.getByText('No batch in progress');
  screen.getByText('No batches have been saved');
});

test('shows saved batch count', () => {
  const status: ScanStatus = mockStatus({
    batches: [
      mockBatch({
        id: 'a',
        count: 1,
      }),
      mockBatch({
        id: 'b',
        count: 3,
      }),
    ],
  });
  renderScreen({ status });
  screen.getByText(hasTextAcrossElements('Total Sheets: 4'));
  screen.getByText(hasTextAcrossElements('Saved Batches: 2'));
});

test('shows the scanning batch in the control card, not the saved list', () => {
  const status: ScanStatus = mockStatus({
    currentBatch: { batchId: 'a', state: 'scanning' },
    batches: [
      mockBatch({
        id: 'a',
        count: 5,
        endedAt: undefined,
      }),
      mockBatch({
        id: 'b',
        label: 'Batch 2',
        count: 3,
      }),
    ],
  });
  renderScreen({ status });
  screen.getByText('Scanning batch');
  screen.getByText(hasTextAcrossElements('5 sheets scanned in this batch'));
  expect(screen.getButton('Stop')).toBeEnabled();

  // only the saved batch appears in the list, and it can't be deleted while a
  // batch is open
  screen.getByText(hasTextAcrossElements('Saved Batches: 1'));
  expect(screen.getAllButtons('Delete')).toHaveLength(1);
  for (const deleteButton of screen.getAllButtons('Delete')) {
    expect(deleteButton).toBeDisabled();
  }
  expect(screen.getButton('Delete All Batches')).toBeDisabled();
  expect(screen.getButton('Save CVRs')).toBeDisabled();
});

test('stop button cancels the batch and shows an info modal', async () => {
  const status: ScanStatus = mockStatus({
    currentBatch: { batchId: 'a', state: 'scanning' },
    batches: [mockBatch({ id: 'a', endedAt: undefined })],
  });
  renderScreen({ status });
  apiMock.expectCancelBatch();
  userEvent.click(screen.getButton('Stop'));

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Batch Canceled' });
  within(modal).getByText(/discarded/);
  userEvent.click(within(modal).getButton('Close'));
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

describe('paused batch', () => {
  const pausedStatus: ScanStatus = mockStatus({
    currentBatch: {
      batchId: 'a',
      state: 'paused',
      pauseReason: 'tray-empty',
    },
    batches: [mockBatch({ id: 'a', count: 7, endedAt: undefined })],
  });

  test('shows the pause reason and sheet count', () => {
    renderScreen({ status: pausedStatus });
    screen.getByText('Batch paused — input tray is empty');
    screen.getByText(hasTextAcrossElements('7 sheets scanned in this batch'));
  });

  test('shows other pause reasons', () => {
    renderScreen({
      status: mockStatus({
        currentBatch: { batchId: 'a', state: 'paused', pauseReason: 'stopped' },
        batches: [mockBatch({ id: 'a', endedAt: undefined })],
      }),
    });
    screen.getByText('Batch paused — scanning stopped');
  });

  test('continue scanning', () => {
    renderScreen({ status: pausedStatus });
    apiMock.expectContinueBatch();
    userEvent.click(screen.getButton('Continue Scanning'));
  });

  test('save batch', () => {
    renderScreen({ status: pausedStatus });
    apiMock.expectSaveBatch();
    userEvent.click(screen.getButton('Save Batch'));
  });

  test('cancel batch requires confirmation', async () => {
    renderScreen({ status: pausedStatus });
    userEvent.click(screen.getButton('Cancel'));

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Cancel Batch' });
    within(modal).getByText(
      hasTextAcrossElements(/All 7 sheets scanned in this batch/)
    );

    apiMock.expectCancelBatch();
    userEvent.click(within(modal).getButton('Cancel Batch'));
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });

  test('cancel batch can be dismissed', async () => {
    renderScreen({ status: pausedStatus });
    userEvent.click(screen.getButton('Cancel'));
    await screen.findByRole('alertdialog');
    userEvent.click(screen.getButton('Close'));
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });
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

describe('Send CVRs Button', () => {
  test('disabled when no VxAdmin host is connected', () => {
    const status: ScanStatus = mockStatus({
      batches: [mockBatch()],
    });
    renderScreen({ status });
    expect(screen.getButton('Send CVRs')).toBeDisabled();
  });

  test('disabled when no batches have been scanned', async () => {
    apiMock.setHostConnectionInfo({
      status: 'connected-to-host',
      hostMachineId: 'ADMIN-01',
    });
    renderScreen();
    await vi.waitFor(() =>
      expect(screen.getButton('Save CVRs')).toBeDisabled()
    );
    expect(screen.getButton('Send CVRs')).toBeDisabled();
  });

  test('enabled when a host is connected and batches are scanned, opens modal', async () => {
    apiMock.setHostConnectionInfo({
      status: 'connected-to-host',
      hostMachineId: 'ADMIN-01',
    });
    const status: ScanStatus = mockStatus({
      batches: [mockBatch()],
    });
    renderScreen({ status });
    await vi.waitFor(() => expect(screen.getButton('Send CVRs')).toBeEnabled());

    userEvent.click(screen.getButton('Send CVRs'));
    await screen.findByRole('heading', { name: 'Send CVRs' });
  });
});

describe('Scan Ballots Button', () => {
  test('disabled when no scanner is attached', () => {
    renderScreen({ status: mockStatus({ isScannerAttached: false }) });
    expect(screen.getButton('No Scanner')).toBeDisabled();
  });

  test('replaced by batch controls when there is an ongoing batch', () => {
    renderScreen({
      status: mockStatus({
        currentBatch: { batchId: 'a', state: 'scanning' },
        batches: [mockBatch({ id: 'a', endedAt: undefined })],
      }),
    });
    expect(
      screen.queryByRole('button', { name: 'Scan New Batch' })
    ).not.toBeInTheDocument();
    screen.getButton('Stop');
  });

  test('disabled when scan status is stale', () => {
    renderScreen({ statusIsStale: true });
    expect(screen.getButton('Scan New Batch')).toBeDisabled();
  });

  test('enabled otherwise', () => {
    renderScreen();
    expect(screen.getButton('Scan New Batch')).toBeEnabled();
  });
});
