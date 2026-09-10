import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { screen } from '../../test/react_testing_library.js';
import {
  ScanBallotsScreen,
  ScanBallotsScreenProps,
} from './scan_ballots_screen.js';
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
  expect(screen.getByTestId('total-batches')).toHaveTextContent('2');
  expect(screen.getByTestId('total-sheets')).toHaveTextContent('4');
});

describe('Scan Ballots Button', () => {
  test('disabled when no scanner is attached', () => {
    renderScreen({
      status: mockStatus({}, { state: 'disconnected' }),
    });
    expect(screen.getButton('No Scanner')).toBeDisabled();
  });

  test('disabled when there is an ongoing batch', () => {
    renderScreen({
      status: mockStatus({}, { state: 'scanning', batchId: 'a' }),
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
