import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Scan } from '@votingworks/api';
import fetchMock from 'fetch-mock';
import { CalibrateScannerModal } from './calibrate_scanner_modal';

const fakeScannerStatus: Scan.PrecinctScannerStatus = {
  state: 'no_paper',
  ballotsCounted: 0,
  canUnconfigure: true,
};

test('shows instructions', async () => {
  render(
    <CalibrateScannerModal
      scannerStatus={fakeScannerStatus}
      onCancel={jest.fn()}
    />
  );

  await screen.findByText(/blank sheet of white paper/);
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

  fireEvent.click(await screen.findByText('Cancel'));
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

  fireEvent.click(await screen.findByText('Cancel'));
  expect(onCancel).toHaveBeenCalled();
});

test('calibrate start', async () => {
  fetchMock.postOnce('/scanner/calibrate', { body: { status: 'ok' } });
  render(
    <CalibrateScannerModal
      scannerStatus={{ ...fakeScannerStatus, state: 'ready_to_scan' }}
      onCancel={jest.fn()}
    />
  );

  // calibrate
  fireEvent.click(await screen.findByText('Calibrate'));
  expect(fetchMock.done()).toBe(true);
});

test('calibrate progress', async () => {
  render(
    <CalibrateScannerModal
      scannerStatus={{ ...fakeScannerStatus, state: 'calibrating' }}
      onCancel={jest.fn()}
    />
  );
  await screen.findByText(/Calibrating/);
});

test('calibrate success', async () => {
  fetchMock.postOnce('/scanner/wait-for-paper', { body: { status: 'ok' } });
  const onCancel = jest.fn();
  render(
    <CalibrateScannerModal
      scannerStatus={{ ...fakeScannerStatus, state: 'calibrated' }}
      onCancel={onCancel}
    />
  );
  await screen.findByText('Calibration succeeded!');

  fireEvent.click(await screen.findByText('Close'));
  expect(fetchMock.done()).toBe(true);
  await waitFor(() => expect(onCancel).toHaveBeenCalled());
});

test('calibrate error', async () => {
  fetchMock.postOnce('/scanner/wait-for-paper', { body: { status: 'ok' } });
  const onCancel = jest.fn();
  render(
    <CalibrateScannerModal
      scannerStatus={{
        ...fakeScannerStatus,
        state: 'calibrated',
        error: 'plustek_error',
      }}
      onCancel={onCancel}
    />
  );
  await screen.findByText('Calibration failed!');

  fireEvent.click(await screen.findByText('Cancel'));
  expect(fetchMock.done()).toBe(true);
  await waitFor(() => expect(onCancel).toHaveBeenCalled());
});

test('calibrate error & try again', async () => {
  fetchMock.postOnce('/scanner/wait-for-paper', { body: { status: 'ok' } });
  const onCancel = jest.fn();
  render(
    <CalibrateScannerModal
      scannerStatus={{
        ...fakeScannerStatus,
        state: 'calibrated',
        error: 'plustek_error',
      }}
      onCancel={onCancel}
    />
  );
  await screen.findByText('Calibration failed!');

  fireEvent.click(await screen.findByText('Try again'));
  expect(fetchMock.done()).toBe(true);
});
