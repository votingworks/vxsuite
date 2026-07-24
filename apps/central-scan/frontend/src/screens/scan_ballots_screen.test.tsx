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
  expect(screen.getButton('Start Batch 1')).toBeDisabled();
});

test('null state', () => {
  renderScreen();
  screen.getByText('Ready to Scan');
  screen.getByText('Total Batches');
  expect(screen.getByTestId('total-batches')).toHaveTextContent('0');
  screen.getByText('Total Sheets');
  expect(screen.getByTestId('total-sheets')).toHaveTextContent('0');
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
  expect(screen.getByTestId('total-sheets')).toHaveTextContent('4');
  expect(screen.getByTestId('total-batches')).toHaveTextContent('2');
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
  screen.getByText('Scanning');
  screen.getByText('Batch 1');
  screen.getByText('5');
  expect(screen.getButton('Stop Scanning')).toBeEnabled();

  // only the saved batch is counted in the summary
  expect(screen.getByTestId('total-batches')).toHaveTextContent('1');
});

test('stop button confirms, cancels the batch, and shows an info modal', async () => {
  const status: ScanStatus = mockStatus({
    currentBatch: { batchId: 'a', state: 'scanning' },
    batches: [mockBatch({ id: 'a', count: 5, endedAt: undefined })],
  });
  renderScreen({ status });
  userEvent.click(screen.getButton('Stop Scanning'));

  const confirmModal = await screen.findByRole('alertdialog');
  within(confirmModal).getByRole('heading', { name: 'Stop Scanning' });
  within(confirmModal).getByText(
    hasTextAcrossElements(
      /all 5 sheets scanned in this batch will be discarded/
    )
  );
  apiMock.expectCancelBatch();
  userEvent.click(within(confirmModal).getButton('Stop and Discard'));

  await screen.findByRole('heading', { name: 'Batch Discarded' });
  screen.getByText(/discarded/);
  userEvent.click(screen.getButton('Close'));
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
    screen.getByText('Paused');
    screen.getByText('Batch 1');
    screen.getByText('Input tray empty');
    screen.getByText('7');
  });

  test('shows other pause reasons', () => {
    const { unmount } = renderScreen({
      status: mockStatus({
        currentBatch: { batchId: 'a', state: 'paused', pauseReason: 'stopped' },
        batches: [mockBatch({ id: 'a', endedAt: undefined })],
      }),
    });
    screen.getByText('Scanning stopped');
    unmount();

    renderScreen({
      status: mockStatus({
        currentBatch: { batchId: 'a', state: 'paused', pauseReason: 'error' },
        batches: [mockBatch({ id: 'a', endedAt: undefined })],
      }),
    });
    screen.getByText('A scanning error occurred');
  });

  test('continue scanning', () => {
    renderScreen({ status: pausedStatus });
    apiMock.expectContinueBatch();
    userEvent.click(screen.getButton('Continue Scanning'));
  });

  test('continue scanning is disabled when the scanner is disconnected', () => {
    renderScreen({
      status: { ...pausedStatus, isScannerAttached: false },
    });
    screen.getByText('Paused');
    screen.getByText(/Connect the scanner to continue scanning/);
    expect(screen.getButton('Continue Scanning')).toBeDisabled();
    expect(screen.getButton('Save Batch')).toBeEnabled();
    expect(screen.getButton('Discard Batch')).toBeEnabled();
  });

  test('save batch requires confirmation', async () => {
    renderScreen({ status: pausedStatus });
    userEvent.click(screen.getButton('Save Batch'));

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Save Batch' });
    within(modal).getByText(
      hasTextAcrossElements(
        /All 7 sheets scanned in this batch will be saved and sent to VxAdmin/
      )
    );

    apiMock.expectSaveBatch();
    userEvent.click(within(modal).getButton('Save Batch'));
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });

  test('save batch can be dismissed', async () => {
    renderScreen({ status: pausedStatus });
    userEvent.click(screen.getButton('Save Batch'));
    await screen.findByRole('alertdialog');
    userEvent.click(screen.getButton('Cancel'));
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });

  test('discard batch requires confirmation', async () => {
    renderScreen({ status: pausedStatus });
    userEvent.click(screen.getButton('Discard Batch'));

    const modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Discard Batch' });
    within(modal).getByText(
      hasTextAcrossElements(/All 7 sheets scanned in this batch/)
    );

    apiMock.expectCancelBatch();
    userEvent.click(within(modal).getButton('Discard Batch'));
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });

  test('discard batch can be dismissed', async () => {
    renderScreen({ status: pausedStatus });
    userEvent.click(screen.getButton('Discard Batch'));
    await screen.findByRole('alertdialog');
    userEvent.click(screen.getButton('Close'));
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });
});

test('there is no manual Send CVRs button; batches are sent automatically', () => {
  const status: ScanStatus = mockStatus({
    batches: [mockBatch()],
  });
  renderScreen({ status });
  expect(
    screen.queryByRole('button', { name: 'Send CVRs' })
  ).not.toBeInTheDocument();
});

describe('Scan Ballots Button', () => {
  test('hidden and shows a disconnected status when no scanner is attached', () => {
    renderScreen({ status: mockStatus({ isScannerAttached: false }) });
    screen.getByText('Scanner Disconnected');
    expect(screen.queryByText('Ready to Scan')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Start Batch/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'No Scanner' })
    ).not.toBeInTheDocument();
  });

  test('replaced by batch controls when there is an ongoing batch', () => {
    renderScreen({
      status: mockStatus({
        currentBatch: { batchId: 'a', state: 'scanning' },
        batches: [mockBatch({ id: 'a', endedAt: undefined })],
      }),
    });
    expect(
      screen.queryByRole('button', { name: /Start Batch/ })
    ).not.toBeInTheDocument();
    screen.getButton('Stop Scanning');
  });

  test('disabled when scan status is stale', () => {
    renderScreen({ statusIsStale: true });
    expect(screen.getButton('Start Batch 1')).toBeDisabled();
  });

  test('enabled otherwise', () => {
    renderScreen();
    expect(screen.getButton('Start Batch 1')).toBeEnabled();
  });
});
