import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ScannerStatus,
  GetScanStatusResponse,
} from '@votingworks/types/api/module-scan';
import { createMemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import { DashboardScreen } from './dashboard_screen';

const noneLeftAdjudicationStatus = {
  adjudicated: 0,
  remaining: 0,
};

test('null state', () => {
  const deleteBatch = jest.fn();
  const status: GetScanStatusResponse = {
    batches: [],
    adjudication: noneLeftAdjudicationStatus,
    scanner: ScannerStatus.Unknown,
  };
  const component = render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen
        deleteBatch={deleteBatch}
        isScanning={false}
        status={status}
      />
    </Router>
  );

  expect(component.baseElement.textContent).toMatch(
    /No ballots have been scanned/
  );
});

test('shows scanned ballot count', () => {
  const deleteBatch = jest.fn();
  const status: GetScanStatusResponse = {
    batches: [
      {
        id: 'a',
        count: 1,
        label: 'Batch 1',
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
      },
      {
        id: 'b',
        count: 3,
        label: 'Batch 2',
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
      },
    ],
    adjudication: noneLeftAdjudicationStatus,
    scanner: ScannerStatus.Unknown,
  };
  const component = render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen
        deleteBatch={deleteBatch}
        isScanning={false}
        status={status}
      />
    </Router>
  );

  expect(component.baseElement.textContent).toMatch(
    /A total of 4 ballots have been scanned in 2 batches/
  );
});

test('shows whether a batch is scanning', () => {
  const deleteBatch = jest.fn();
  const status: GetScanStatusResponse = {
    batches: [
      {
        id: 'a',
        label: 'Batch 1',
        count: 3,
        startedAt: new Date(0).toISOString(),
      },
    ],
    adjudication: noneLeftAdjudicationStatus,
    scanner: ScannerStatus.Unknown,
  };
  const component = render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen deleteBatch={deleteBatch} isScanning status={status} />
    </Router>
  );

  expect(component.baseElement.textContent).toMatch(/Scanning…/);
});

test('allows deleting a batch', async () => {
  const deleteBatch = jest.fn();
  const status: GetScanStatusResponse = {
    batches: [
      {
        id: 'a',
        label: 'Batch 1',
        count: 1,
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
      },
      {
        id: 'b',
        label: 'Batch 2',
        count: 3,
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
      },
    ],
    adjudication: noneLeftAdjudicationStatus,
    scanner: ScannerStatus.Unknown,
  };
  render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen
        deleteBatch={deleteBatch}
        isScanning={false}
        status={status}
      />
    </Router>
  );

  expect(deleteBatch).not.toHaveBeenCalled();
  const [deleteBatch1Button, deleteBatch2Button] = screen.getAllByText(
    'Delete',
    { selector: 'button' }
  );

  let deleteBatch1Resolve!: VoidFunction;
  let deleteBatch2Reject!: (error: unknown) => void;
  let deleteBatch2Resolve!: VoidFunction;
  deleteBatch
    .mockResolvedValueOnce(
      new Promise<void>((resolve) => {
        deleteBatch1Resolve = resolve;
      })
    )
    .mockResolvedValueOnce(
      new Promise<void>((_resolve, reject) => {
        deleteBatch2Reject = reject;
      })
    )
    .mockResolvedValueOnce(
      new Promise<void>((resolve) => {
        deleteBatch2Resolve = resolve;
      })
    );

  // Click delete & confirm.
  userEvent.click(deleteBatch1Button);
  userEvent.click(screen.getByText('Yes, Delete Batch'));
  await screen.findByText('Deleting…');
  expect(deleteBatch).toHaveBeenNthCalledWith(1, status.batches[0].id);
  act(() => deleteBatch1Resolve());
  await waitFor(() => !screen.getByText('Delete ‘Batch 1’?'));

  // Click delete but cancel.
  userEvent.click(deleteBatch2Button);
  userEvent.click(screen.getByText('Cancel'));
  expect(deleteBatch).not.toHaveBeenCalledWith(status.batches[1].id);

  // Click delete & confirm but fail.
  userEvent.click(deleteBatch2Button);
  userEvent.click(screen.getByText('Yes, Delete Batch'));
  await screen.findByText('Deleting…');
  expect(deleteBatch).toHaveBeenNthCalledWith(2, status.batches[1].id);
  act(() => deleteBatch2Reject(new Error('batch is a teapot')));
  await waitFor(() => screen.getByText('batch is a teapot'));

  // Try again.
  userEvent.click(screen.getByText('Yes, Delete Batch'));
  act(() => deleteBatch2Resolve());
  await waitFor(() => !screen.getByText('Delete ‘Batch 2’?'));
});
