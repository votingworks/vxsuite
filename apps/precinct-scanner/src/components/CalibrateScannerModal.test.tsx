import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { mocked } from 'ts-jest/utils'
import { ScannerStatus } from '@votingworks/types/api/module-scan'
import { deferred } from '@votingworks/utils'
import CalibrateScannerModal from './CalibrateScannerModal'
import usePrecinctScanner from '../hooks/usePrecinctScanner'

jest.mock('../hooks/usePrecinctScanner')

const usePrecinctScannerMock = mocked(usePrecinctScanner)

test('shows instructions', async () => {
  const onCalibrate = jest.fn()
  const onCancel = jest.fn()
  render(
    <CalibrateScannerModal onCalibrate={onCalibrate} onCancel={onCancel} />
  )

  await screen.findByText(/blank sheet of white paper/)
})

test('waiting for paper', async () => {
  usePrecinctScannerMock.mockReturnValueOnce({
    status: {
      ballotCount: 0,
      ballotNeedsReview: false,
      scannerState: ScannerStatus.WaitingForPaper,
    },
  })

  const onCalibrate = jest.fn()
  const onCancel = jest.fn()
  render(
    <CalibrateScannerModal onCalibrate={onCalibrate} onCancel={onCancel} />
  )

  expect(
    ((await screen.findByText('Waiting for Paper')) as HTMLButtonElement)
      .disabled
  ).toBe(true)

  fireEvent.click(await screen.findByText('Cancel'))
  expect(onCancel).toHaveBeenCalled()
})

test('scanner not available', async () => {
  usePrecinctScannerMock.mockReturnValueOnce({
    status: {
      ballotCount: 0,
      ballotNeedsReview: false,
      scannerState: ScannerStatus.Error,
    },
  })

  const onCalibrate = jest.fn()
  const onCancel = jest.fn()
  render(
    <CalibrateScannerModal onCalibrate={onCalibrate} onCancel={onCancel} />
  )

  expect(
    ((await screen.findByText('Cannot Calibrate')) as HTMLButtonElement)
      .disabled
  ).toBe(true)

  fireEvent.click(await screen.findByText('Cancel'))
  expect(onCancel).toHaveBeenCalled()
})

test('calibrate success', async () => {
  const { promise, resolve } = deferred<boolean>()
  usePrecinctScannerMock.mockReturnValueOnce({
    status: {
      ballotCount: 0,
      ballotNeedsReview: false,
      scannerState: ScannerStatus.ReadyToScan,
    },
  })

  const onCalibrate = jest.fn().mockResolvedValueOnce(promise)
  const onCancel = jest.fn()
  render(
    <CalibrateScannerModal onCalibrate={onCalibrate} onCancel={onCancel} />
  )

  // calibrate
  fireEvent.click(await screen.findByText('Calibrate'))
  expect(onCalibrate).toHaveBeenCalled()
  await screen.findByText('Calibrating…')
  resolve(true)
  await screen.findByText('Calibration succeeded!')

  // finish
  fireEvent.click(await screen.findByText('Back'))
  expect(onCancel).toHaveBeenCalled()
})

test('calibrate error', async () => {
  const { promise, resolve } = deferred<boolean>()
  usePrecinctScannerMock.mockReturnValueOnce({
    status: {
      ballotCount: 0,
      ballotNeedsReview: false,
      scannerState: ScannerStatus.ReadyToScan,
    },
  })

  const onCalibrate = jest.fn().mockResolvedValueOnce(promise)
  const onCancel = jest.fn()
  render(
    <CalibrateScannerModal onCalibrate={onCalibrate} onCancel={onCancel} />
  )

  // calibrate
  fireEvent.click(await screen.findByText('Calibrate'))
  expect(onCalibrate).toHaveBeenCalled()
  await screen.findByText('Calibrating…')
  resolve(false)
  await screen.findByText('Calibration failed!')

  // finish
  fireEvent.click(await screen.findByText('Cancel'))
  expect(onCancel).toHaveBeenCalled()
})

test('calibrate error & try again', async () => {
  const calibrateDeferred1 = deferred<boolean>()
  const calibrateDeferred2 = deferred<boolean>()
  usePrecinctScannerMock.mockReturnValue({
    status: {
      ballotCount: 0,
      ballotNeedsReview: false,
      scannerState: ScannerStatus.ReadyToScan,
    },
  })

  const onCalibrate = jest
    .fn()
    .mockResolvedValueOnce(calibrateDeferred1.promise)
    .mockResolvedValueOnce(calibrateDeferred2.promise)
  const onCancel = jest.fn()
  render(
    <CalibrateScannerModal onCalibrate={onCalibrate} onCancel={onCancel} />
  )

  // calibrate
  fireEvent.click(await screen.findByText('Calibrate'))
  expect(onCalibrate).toHaveBeenCalledTimes(1)
  await screen.findByText('Calibrating…')
  calibrateDeferred1.resolve(false)
  await screen.findByText('Calibration failed!')

  // try again
  fireEvent.click(await screen.findByText('Try again'))
  fireEvent.click(await screen.findByText('Calibrate'))
  expect(onCalibrate).toHaveBeenCalledTimes(2)
  await screen.findByText('Calibrating…')
  calibrateDeferred2.resolve(true)
  await screen.findByText('Calibration succeeded!')

  // finish
  fireEvent.click(await screen.findByText('Back'))
  expect(onCancel).toHaveBeenCalled()
})
