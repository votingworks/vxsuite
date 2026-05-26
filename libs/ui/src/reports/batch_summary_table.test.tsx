import { expect, test } from 'vite-plus/test';
import { BatchInfo } from '@votingworks/types';
import { render, screen, within } from '../../test/react_testing_library';
import { BatchSummaryTable } from './batch_summary_table';

const batch1: BatchInfo = {
  id: 'a3c38c4b-0012-4ab1-b4ef-0d95671595ca',
  batchNumber: 1,
  label: 'Batch 1',
  startedAt: '2021-09-19T11:00:00.000Z',
  endedAt: '2021-09-19T11:05:00.000Z',
  count: 10,
};

const batch2: BatchInfo = {
  id: 'f7c3b5d2-1e45-4f67-a89b-cde401234567',
  batchNumber: 2,
  label: 'Batch 2',
  startedAt: '2021-09-19T12:00:00.000Z',
  endedAt: '2021-09-19T12:30:00.000Z',
  count: 5,
};

test('renders column headers and no data rows when batches is empty', () => {
  render(<BatchSummaryTable batches={[]} />);
  const rows = screen.queryAllByRole('row');
  expect(rows).toHaveLength(1); // header row only
  const [headerRow] = rows;
  const headers = within(headerRow).getAllByRole('columnheader');
  expect(headers[0]).toHaveTextContent('Batch ID');
  expect(headers[1]).toHaveTextContent('Sheets Scanned');
  expect(headers[2]).toHaveTextContent('Polls Opened / Resumed');
  expect(headers[3]).toHaveTextContent('Polls Closed / Paused');
});

test('renders a single batch row with id, count, and formatted dates', () => {
  render(<BatchSummaryTable batches={[batch1]} />);

  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(2);

  const [, dataRow] = rows;
  const cells = within(dataRow).getAllByRole('cell');
  expect(cells[0]).toHaveTextContent('a3c38c4b-0d95671595ca');
  expect(cells[1]).toHaveTextContent('10');
  expect(cells[2]).toHaveTextContent('Sep 19, 2021, 3:00 AM');
  expect(cells[3]).toHaveTextContent('Sep 19, 2021, 3:05 AM');
});

test('renders a dash for a batch with no end time', () => {
  const ongoingBatch: BatchInfo = { ...batch1, endedAt: undefined };
  render(<BatchSummaryTable batches={[ongoingBatch]} />);

  const [, dataRow] = screen.getAllByRole('row');
  const cells = within(dataRow).getAllByRole('cell');
  expect(cells[3]).toHaveTextContent('—');
});

test('renders multiple batches in order', () => {
  render(<BatchSummaryTable batches={[batch1, batch2]} />);

  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(3);

  const [, row1, row2] = rows;
  const row1Cells = within(row1).getAllByRole('cell');
  expect(row1Cells[0]).toHaveTextContent('a3c38c4b-0d95671595ca');
  expect(row1Cells[1]).toHaveTextContent('10');
  expect(row1Cells[2]).toHaveTextContent('Sep 19, 2021, 3:00 AM');
  expect(row1Cells[3]).toHaveTextContent('Sep 19, 2021, 3:05 AM');

  const row2Cells = within(row2).getAllByRole('cell');
  expect(row2Cells[0]).toHaveTextContent('f7c3b5d2-cde401234567');
  expect(row2Cells[1]).toHaveTextContent('5');
  expect(row2Cells[2]).toHaveTextContent('Sep 19, 2021, 4:00 AM');
  expect(row2Cells[3]).toHaveTextContent('Sep 19, 2021, 4:30 AM');
});
