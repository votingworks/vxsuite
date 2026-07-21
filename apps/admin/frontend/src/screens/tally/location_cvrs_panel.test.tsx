import { expect, test, vi } from 'vitest';
import { pollingPlaceTypeName } from '@votingworks/types/src';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { LocationCvrsPanel } from './location_cvrs_panel';

test('renders empty state note when open with no imports available', () => {
  render(
    <LocationCvrsPanel
      closePanel={vi.fn()}
      imports={[]}
      name="Vx City"
      type="absentee"
    />
  );

  screen.getButton('Close Panel');
  screen.getByText(pollingPlaceTypeName('absentee'));
  screen.getByText('Vx City');
  screen.getByText('No CVRs');

  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
});

test('renders import details when non-empty', () => {
  render(
    <LocationCvrsPanel
      closePanel={vi.fn()}
      imports={[
        {
          id: 'one',
          exportTimestamp: '2020-11-07T08:00:00',
          numCvrsImported: 412,
          scannerIds: ['SCAN-01-0001'],
          source: 'usb',
          batchLabels: ['Batch 1', 'Batch 2'],
        },
        {
          id: 'two',
          exportTimestamp: '2020-11-07T09:00:00',
          numCvrsImported: 943,
          scannerIds: ['SCAN-01-0001', 'SCAN-01-0002'],
          source: 'network',
          batchLabels: ['Batch 7'],
        },
      ]}
      name="Vx City"
      type="absentee"
    />
  );

  screen.getButton('Close Panel');
  screen.getByText(pollingPlaceTypeName('absentee'));
  screen.getByText('Vx City');

  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'Scanner SCAN-01-0001, 2 batches11/7/2020, 8:00 AM •  USB412',
    '2 scanners, Batch 711/7/2020, 9:00 AM •  Network943',
  ]);

  expect(screen.queryByText('No CVRs')).not.toBeInTheDocument();
});

test('shows remove buttons when onDeleteImport is provided', () => {
  const onDeleteImport = vi.fn();

  render(
    <LocationCvrsPanel
      closePanel={vi.fn()}
      imports={[
        {
          id: 'one',
          exportTimestamp: '2020-11-07T08:00:00',
          numCvrsImported: 412,
          scannerIds: ['SCAN-01-0001'],
          source: 'network',
          batchLabels: ['Batch 7'],
        },
      ]}
      name="Vx City"
      onDeleteImport={onDeleteImport}
      type="absentee"
    />
  );

  userEvent.click(screen.getButton('Remove Scanner SCAN-01-0001, Batch 7'));
  expect(onDeleteImport).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: 'one' })
  );
});

test('filters imports by batch name or title', () => {
  render(
    <LocationCvrsPanel
      closePanel={vi.fn()}
      imports={[
        {
          id: 'one',
          exportTimestamp: '2020-11-07T08:00:00',
          numCvrsImported: 100,
          scannerIds: ['CS-01'],
          source: 'network',
          batchLabels: ['Batch 4'],
        },
        {
          id: 'two',
          exportTimestamp: '2020-11-07T09:00:00',
          numCvrsImported: 200,
          scannerIds: ['CS-01'],
          source: 'network',
          batchLabels: ['Batch 12'],
        },
        {
          id: 'three',
          exportTimestamp: '2020-11-08T09:00:00',
          numCvrsImported: 300,
          scannerIds: ['VXSCAN-01'],
          source: 'usb',
          batchLabels: ['Batch 1', 'Batch 2'],
        },
      ]}
      name="Vx City"
      type="absentee"
    />
  );

  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  const input = screen.getByPlaceholderText('Search Files');

  // Matches a single-batch import by its batch-label title
  userEvent.type(input, 'batch 4');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  screen.getByText('Scanner CS-01, Batch 4');

  // Matches a multi-batch import by an undisplayed batch label
  userEvent.click(screen.getButton('Clear Search Query'));
  userEvent.type(input, 'Batch 2');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  screen.getByText('Scanner VXSCAN-01, 2 batches');

  // Matches a timestamp title
  userEvent.click(screen.getButton('Clear Search Query'));
  userEvent.type(input, '11/8');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);

  // Matches by scanner ID
  userEvent.click(screen.getButton('Clear Search Query'));
  userEvent.type(input, 'vxscan');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  screen.getByText('Scanner VXSCAN-01, 2 batches');

  userEvent.click(screen.getButton('Clear Search Query'));
  userEvent.type(input, 'CS-01');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);

  // Shows an empty state when nothing matches
  userEvent.click(screen.getButton('Clear Search Query'));
  userEvent.type(input, 'nonsense');
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  screen.getByText(/No imports match/);
});

test('emits close event when on close button press', () => {
  const close = vi.fn();

  render(
    <LocationCvrsPanel
      closePanel={close}
      imports={[]}
      name="Vx City"
      type="absentee"
    />
  );

  expect(close).not.toHaveBeenCalled();
  userEvent.click(screen.getButton('Close Panel'));
  expect(close).toHaveBeenCalledOnce();
});
