import { hasTextAcrossElements } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { screen, waitFor } from '../../test/react_testing_library';
import {
  ScanBallotsScreen,
  ScanBallotsScreenProps,
} from './scan_ballots_screen';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/api';

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
      isScannerAttached
      status={{
        ongoingBatchId: undefined,
        adjudicationsRemaining: 0,
        canUnconfigure: true,
        batches: [],
      }}
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
  const status: ScanStatus = {
    ongoingBatchId: undefined,
    adjudicationsRemaining: 0,
    canUnconfigure: false,
    batches: [
      {
        id: 'a',
        batchNumber: 1,
        count: 1,
        label: 'Batch 1',
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
      },
      {
        id: 'b',
        batchNumber: 2,
        count: 3,
        label: 'Batch 2',
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
      },
    ],
  };
  renderScreen({ status });
  screen.getByText(
    hasTextAcrossElements(
      'A total of 4 ballots have been scanned in 2 batches.'
    )
  );
});

test('shows whether a batch is scanning', () => {
  const status: ScanStatus = {
    ongoingBatchId: 'a',
    adjudicationsRemaining: 0,
    canUnconfigure: false,
    batches: [
      {
        id: 'a',
        batchNumber: 1,
        label: 'Batch 1',
        count: 3,
        startedAt: new Date(0).toISOString(),
      },
    ],
  };
  renderScreen({ status });
  screen.getByText('Scanning…');
  for (const deleteButton of screen.getAllButtons('Delete')) {
    expect(deleteButton).toBeDisabled();
  }
  expect(screen.getButton('Delete All Batches')).toBeDisabled();
});

test('Delete All Batches is not allowed when canUnconfigure is false', () => {
  const status: ScanStatus = {
    ongoingBatchId: undefined,
    adjudicationsRemaining: 0,
    canUnconfigure: false,
    batches: [
      {
        id: 'a',
        batchNumber: 1,
        label: 'Batch 1',
        count: 3,
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
      },
    ],
  };
  renderScreen({ status });

  userEvent.click(screen.getButton('Delete All Batches'));
  screen.getByRole('heading', { name: 'Backup Required' });
  userEvent.click(screen.getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('Delete All Batches button', async () => {
  const status: ScanStatus = {
    ongoingBatchId: undefined,
    adjudicationsRemaining: 0,
    canUnconfigure: true,
    batches: [
      {
        id: 'a',
        batchNumber: 1,
        label: 'Batch 1',
        count: 3,
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
      },
    ],
  };
  renderScreen({ status });

  // initial button
  userEvent.click(screen.getButton('Delete All Batches'));

  // confirmation
  apiMock.expectClearBallotData();
  screen.getByText('Delete All Scanned Batches?');
  userEvent.click(screen.getButton('Yes, Delete All Batches'));

  // progress message
  await screen.findByText('Deleting ballot data');
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

describe('Scan Ballots Button', () => {
  test('disabled when no scanner is attached', () => {
    renderScreen({ isScannerAttached: false });
    expect(screen.getButton('No Scanner')).toBeDisabled();
  });

  test('disabled when there is an ongoing batch', () => {
    renderScreen({
      status: {
        ongoingBatchId: 'a',
        canUnconfigure: true,
        adjudicationsRemaining: 0,
        batches: [],
      },
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
