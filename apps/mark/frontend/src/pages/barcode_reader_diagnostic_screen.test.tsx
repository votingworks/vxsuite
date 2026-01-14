import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import { BarcodeReaderDiagnosticScreen } from './barcode_reader_diagnostic_screen';

let apiMock: ApiMock;
let onComplete: () => void;
let onCancel: () => void;

function renderScreen() {
  return render(
    provideApi(
      apiMock,
      <BarcodeReaderDiagnosticScreen
        onComplete={onComplete}
        onCancel={onCancel}
      />
    )
  );
}

beforeEach(() => {
  onComplete = vi.fn();
  onCancel = vi.fn();
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2022-03-23T11:23:00.000'),
  });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders barcode reader diagnostic screen', async () => {
  apiMock.expectClearLastBarcodeScan();
  apiMock.expectGetMostRecentBarcodeScan(null);

  renderScreen();

  await screen.findByRole('heading', { name: 'Barcode Reader Test' });
  screen.getByText(/Scan any barcode to verify the barcode reader is working/);
  screen.getByText('Waiting for barcode scan...');
  screen.getByRole('button', { name: 'Barcode Reader Is Not Working' });
  screen.getByRole('button', { name: 'Cancel Test' });
});

test('clears last barcode scan on mount', async () => {
  apiMock.expectClearLastBarcodeScan();
  apiMock.expectGetMostRecentBarcodeScan(null);

  renderScreen();

  await screen.findByRole('heading', { name: 'Barcode Reader Test' });
});

test('passes test when barcode is detected', async () => {
  apiMock.expectClearLastBarcodeScan();
  // Return a barcode scan with timestamp after test start
  apiMock.expectGetMostRecentBarcodeScan({
    data: 'test-barcode-data',
    timestamp: new Date('2022-03-23T11:23:01.000'),
  });
  apiMock.expectAddDiagnosticRecord({
    type: 'mark-barcode-reader',
    outcome: 'pass',
  });

  renderScreen();
  await screen.findByText('Barcode scan data received successfully.');
  userEvent.click(screen.getByRole('button', { name: 'Back' }));

  await waitFor(() => {
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

test('user marks barcode reader as not working - fails test', async () => {
  expect(onComplete).toHaveBeenCalledTimes(0);
  apiMock.expectClearLastBarcodeScan();
  apiMock.expectGetMostRecentBarcodeScan(null);
  apiMock.expectAddDiagnosticRecord({
    type: 'mark-barcode-reader',
    outcome: 'fail',
  });

  renderScreen();

  userEvent.click(
    await screen.findByRole('button', { name: 'Barcode Reader Is Not Working' })
  );

  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('pressing cancel calls onCancel', async () => {
  expect(onCancel).toHaveBeenCalledTimes(0);
  apiMock.expectClearLastBarcodeScan();
  apiMock.expectGetMostRecentBarcodeScan(null);

  renderScreen();

  userEvent.click(await screen.findByRole('button', { name: 'Cancel Test' }));

  expect(onCancel).toHaveBeenCalledTimes(1);
});

test('ignores barcode scans from before test started', async () => {
  apiMock.expectClearLastBarcodeScan();
  // Return a barcode scan with timestamp before test start
  apiMock.expectGetMostRecentBarcodeScan({
    data: 'old-barcode-data',
    timestamp: new Date('2022-03-23T11:22:59.000'),
  });

  renderScreen();

  await screen.findByRole('heading', { name: 'Barcode Reader Test' });
  // Should still show "Waiting for barcode scan..." not the detected message
  screen.getByText('Waiting for barcode scan...');
  expect(onComplete).not.toHaveBeenCalled();
});
