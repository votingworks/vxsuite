import { Scan } from '@votingworks/api';
import { AdjudicationStatus } from '@votingworks/types';
import { createMemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import { render } from '../../test/react_testing_library';
import { DashboardScreen } from './dashboard_screen';

const noneLeftAdjudicationStatus: AdjudicationStatus = {
  adjudicated: 0,
  remaining: 0,
};

test('null state', () => {
  const status: Scan.GetScanStatusResponse = {
    canUnconfigure: false,
    batches: [],
    adjudication: noneLeftAdjudicationStatus,
  };
  const component = render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen isScanning={false} status={status} />
    </Router>
  );

  expect(component.baseElement.textContent).toMatch(
    /No ballots have been scanned/
  );
});

test('shows scanned ballot count', () => {
  const status: Scan.GetScanStatusResponse = {
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
    adjudication: noneLeftAdjudicationStatus,
  };
  const component = render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen isScanning={false} status={status} />
    </Router>
  );

  expect(component.baseElement.textContent).toMatch(
    /A total of 4 ballots have been scanned in 2 batches/
  );
});

test('shows whether a batch is scanning', () => {
  const status: Scan.GetScanStatusResponse = {
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
    adjudication: noneLeftAdjudicationStatus,
  };
  const component = render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen isScanning status={status} />
    </Router>
  );

  expect(component.baseElement.textContent).toMatch(/Scanning…/);
});
