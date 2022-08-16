import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Scan } from '@votingworks/api';
import fetchMock from 'fetch-mock';
import { deferred } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { CalibrateScannerModal } from './calibrate_scanner_modal';

const fakeScannerStatus: Scan.PrecinctScannerStatus = {
  state: 'no_paper',
  ballotsCounted: 0,
  canUnconfigure: true,
};

test('shows instructions', () => {
  render(
    <CalibrateScannerModal
      scannerStatus={fakeScannerStatus}
      onCancel={jest.fn()}
    />
  );

  screen.getByRole('heading', { name: 'Calibrate Scanner' });
  screen.getByText(/blank sheet of white paper/);
});

test('waiting for paper', async () => {
  const onCancel = jest.fn();
  render(
    <CalibrateScannerModal
      scannerStatus={fakeScannerStatus}
      onCancel={onCancel}
    />
  );

  expect(
    (await screen.findByText<HTMLButtonElement>('Waiting for Paper')).disabled
  ).toBe(true);

  userEvent.click(await screen.findByText('Cancel'));
  expect(onCancel).toHaveBeenCalled();
});

test('scanner not available', async () => {
  const onCancel = jest.fn();
  render(
    <CalibrateScannerModal
      scannerStatus={{ ...fakeScannerStatus, state: 'jammed' }}
      onCancel={onCancel}
    />
  );

  expect(
    (await screen.findByText<HTMLButtonElement>('Cannot Calibrate')).disabled
  ).toBe(true);

  userEvent.click(await screen.findByText('Cancel'));
  expect(onCancel).toHaveBeenCalled();
});

test('calibrate success', async () => {
  const { promise, resolve } = deferred<{ body: Scan.CalibrateResponse }>();
  fetchMock.postOnce('/precinct-scanner/scanner/calibrate', promise);
  render(
    <CalibrateScannerModal
      // Note that in reality, scanner status would update as the scanner
      // calibrates, but the modal ignores it, so we don't bother mocking the
      // changes.
      scannerStatus={{ ...fakeScannerStatus, state: 'ready_to_scan' }}
      onCancel={jest.fn()}
    />
  );

  userEvent.click(await screen.findByText('Calibrate'));
  expect(fetchMock.done()).toBe(true);

  screen.getByText('Calibrating…');

  resolve({ body: { status: 'ok' } });

  await screen.findByText('Calibration succeeded!');
});

test('calibrate error and cancel', async () => {
  const { promise, resolve } = deferred<{ body: Scan.CalibrateResponse }>();
  fetchMock.postOnce('/precinct-scanner/scanner/calibrate', promise);
  const onCancel = jest.fn();
  render(
    <CalibrateScannerModal
      // Note that in reality, scanner status would update as the scanner
      // calibrates, but the modal ignores it, so we don't bother mocking the
      // changes.
      scannerStatus={{ ...fakeScannerStatus, state: 'ready_to_scan' }}
      onCancel={onCancel}
    />
  );

  userEvent.click(await screen.findByText('Calibrate'));
  expect(fetchMock.done()).toBe(true);

  screen.getByText('Calibrating…');

  resolve({
    body: {
      status: 'error',
      errors: [{ type: 'error', message: 'Calibration error' }],
    },
  });

  await screen.findByText('Calibration failed!');

  userEvent.click(await screen.findByText('Cancel'));
  await waitFor(() => expect(onCancel).toHaveBeenCalled());
});

test('calibrate error and try again', async () => {
  const { promise, resolve } = deferred<{ body: Scan.CalibrateResponse }>();
  fetchMock.postOnce('/precinct-scanner/scanner/calibrate', promise);
  render(
    <CalibrateScannerModal
      // Note that in reality, scanner status would update as the scanner
      // calibrates, but the modal ignores it, so we don't bother mocking the
      // changes.
      scannerStatus={{ ...fakeScannerStatus, state: 'ready_to_scan' }}
      onCancel={jest.fn()}
    />
  );

  userEvent.click(await screen.findByText('Calibrate'));
  expect(fetchMock.done()).toBe(true);

  screen.getByText('Calibrating…');

  resolve({
    body: {
      status: 'error',
      errors: [{ type: 'error', message: 'Calibration error' }],
    },
  });

  await screen.findByText('Calibration failed!');

  userEvent.click(await screen.findByText('Try again'));
  screen.getByRole('heading', { name: 'Calibrate Scanner' });
});

// This test won't actually fail, but it will cause the warning:
// "An update to CalibrateScannerModal inside a test was not wrapped in act(...)."
test('unmount during calibration (e.g. if election manager card removed)', async () => {
  const { promise, resolve } = deferred<{ body: Scan.CalibrateResponse }>();
  fetchMock.postOnce('/precinct-scanner/scanner/calibrate', promise);
  const { unmount } = render(
    <CalibrateScannerModal
      scannerStatus={{ ...fakeScannerStatus, state: 'ready_to_scan' }}
      onCancel={jest.fn()}
    />
  );

  userEvent.click(await screen.findByText('Calibrate'));
  expect(fetchMock.done()).toBe(true);

  screen.getByText('Calibrating…');

  unmount();

  resolve({ body: { status: 'ok' } });
});
