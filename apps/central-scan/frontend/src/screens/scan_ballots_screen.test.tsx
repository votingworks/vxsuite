import { hasTextAcrossElements } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { screen, waitFor, within } from '../../test/react_testing_library';
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
      {...props}
    />,
    { apiMock }
  );
}

test('null state', () => {
  renderScreen();
  screen.getByText('No ballots have been scanned');
});

test('shows scanned ballot count', () => {
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
  screen.getByText(hasTextAcrossElements('Ballot Count: 4'));
  screen.getByText(hasTextAcrossElements('Batch Count: 2'));
});

test('shows whether a batch is scanning', () => {
  const status: ScanStatus = mockStatus({
    ongoingBatchId: 'a',
    batches: [
      mockBatch({
        endedAt: undefined,
      }),
    ],
  });
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
  screen.getByRole('heading', { name: 'Backup Required' });
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
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

describe('Scan Ballots Button', () => {
  test('disabled when no scanner is attached', () => {
    renderScreen({ status: mockStatus({ isScannerAttached: false }) });
    expect(screen.getButton('No Scanner')).toBeDisabled();
  });

  test('disabled when there is an ongoing batch', () => {
    renderScreen({
      status: mockStatus({
        ongoingBatchId: 'a',
      }),
    });
    expect(screen.getButton('Scan New Batch')).toBeDisabled();
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
