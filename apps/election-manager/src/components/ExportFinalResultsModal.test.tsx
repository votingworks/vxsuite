import React from 'react'

import { fireEvent, waitFor } from '@testing-library/react'
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils'
import fetchMock from 'fetch-mock'
import MockDate from 'mockdate'

import { UsbDriveStatus } from '../lib/usbstick'
import ExportFinalResultsModal from './ExportFinalResultsModal'
import renderInAppContext from '../../test/renderInAppContext'

beforeEach(() => {
  jest.useFakeTimers()
  MockDate.set(new Date(2020, 2, 14, 1, 59, 26))
  fetchMock.reset()
})

afterEach(() => {
  MockDate.reset()
  jest.useRealTimers()
})

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting]

  for (const status of usbStatuses) {
    const closeFn = jest.fn()
    const { getByText, unmount } = renderInAppContext(
      <ExportFinalResultsModal onClose={closeFn} />,
      { usbDriveStatus: status }
    )
    getByText('Loading')
    unmount()
  }
})

test('render no usb found screen when there is not a mounted usb drive', () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.notavailable,
    UsbDriveStatus.recentlyEjected,
  ]

  for (const status of usbStatuses) {
    const closeFn = jest.fn()
    const { getByText, unmount, getByAltText } = renderInAppContext(
      <ExportFinalResultsModal onClose={closeFn} />,
      {
        usbDriveStatus: status,
      }
    )
    getByText('No USB Drive Detected')
    getByText(
      'Please insert a USB drive where the election results will be saved.'
    )
    getByAltText('Insert USB Image')

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalled()

    unmount()
  }
})

test('render export modal when a usb drive is mounted as expected and allows automatic export', async () => {
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()])

  fetchMock.getOnce('/convert/results/files', {
    inputFiles: [{ name: 'name' }, { name: 'name' }],
    outputFiles: [{ name: 'name' }],
  })

  fetchMock.post('/convert/results/submitfile', { body: { status: 'ok' } })
  fetchMock.post('/convert/results/process', { body: { status: 'ok' } })

  fetchMock.getOnce('/convert/results/output?name=name', { body: '' })

  fetchMock.post('/convert/reset', { body: { status: 'ok' } })

  const closeFn = jest.fn()
  const { getByText } = renderInAppContext(
    <ExportFinalResultsModal onClose={closeFn} />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
    }
  )
  getByText('Save Results File')
  getByText(/Save the final tally results to /)
  getByText(
    'votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-03-14_01-59-26.csv'
  )

  fireEvent.click(getByText('Save'))
  await waitFor(() => getByText(/Saving/))
  jest.advanceTimersByTime(2001)
  await waitFor(() => getByText(/Results File Saved/))
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1)
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      'fake mount point/votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-03-14_01-59-26.csv',
      '{"body":""}'
    )
  })
  expect(fetchMock.called('/convert/results/files')).toBe(true)
  expect(fetchMock.called('/convert/results/submitfile')).toBe(true)
  expect(fetchMock.called('/convert/results/process')).toBe(true)
  expect(fetchMock.called('/convert/results/output?name=name')).toBe(true)
  expect(fetchMock.called('/convert/reset')).toBe(true)

  fireEvent.click(getByText('Close'))
  expect(closeFn).toHaveBeenCalled()
})

test('render export modal when a usb drive is mounted and exports with external file', async () => {
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()])

  fetchMock.getOnce('/convert/results/files', {
    inputFiles: [{ name: 'name' }, { name: 'name' }],
    outputFiles: [{ name: 'name' }],
  })

  fetchMock.post('/convert/results/submitfile', { body: { status: 'ok' } })
  fetchMock.post('/convert/results/process', { body: { status: 'ok' } })

  fetchMock.getOnce('/convert/results/output?name=name', { body: 'og-results' })

  fetchMock.post('/convert/reset', { body: { status: 'ok' } })

  fetchMock.post('/convert/results/combine', { body: 'combine-results' })

  const externalFile = new File(['content'], 'to-combine.csv')
  const closeFn = jest.fn()
  const { getByText } = renderInAppContext(
    <ExportFinalResultsModal onClose={closeFn} />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
      fullElectionExternalTally: {
        overallTally: { contestTallies: {}, numberOfBallotsCounted: 0 },
        resultsByCategory: new Map(),
      },
      externalVoteRecordsFile: externalFile,
    }
  )
  getByText('Save Results File')
  getByText(/Save the final tally results to /)
  getByText(
    'votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-03-14_01-59-26.csv'
  )

  fireEvent.click(getByText('Save'))
  await waitFor(() => getByText(/Saving/))
  jest.advanceTimersByTime(2001)
  await waitFor(() => getByText(/Results File Saved/))
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1)
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      'fake mount point/votingworks-live-results_choctaw-county_mock-general-election-choctaw-2020_2020-03-14_01-59-26.csv',
      'combine-results'
    )
  })
  expect(fetchMock.called('/convert/results/files')).toBe(true)
  expect(fetchMock.called('/convert/results/submitfile')).toBe(true)
  expect(fetchMock.called('/convert/results/process')).toBe(true)
  expect(fetchMock.called('/convert/results/output?name=name')).toBe(true)
  expect(fetchMock.called('/convert/reset')).toBe(true)
  expect(fetchMock.called('/convert/results/combine')).toBe(true)

  fireEvent.click(getByText('Close'))
  expect(closeFn).toHaveBeenCalled()
})

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk

  // When inputFiles doesn't return 2 expected files the saving code will error.
  fetchMock.getOnce('/convert/results/files', {
    inputFiles: [],
    outputFiles: [],
  })

  const closeFn = jest.fn()
  const { getByText } = renderInAppContext(
    <ExportFinalResultsModal onClose={closeFn} />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
    }
  )
  getByText('Save Results File')

  fireEvent.click(getByText('Save'))
  await waitFor(() => getByText(/Saving Results Failed/))
  getByText(/Failed to save results./)
  getByText(/Cannot read property 'name' of undefined/)

  fireEvent.click(getByText('Close'))
  expect(closeFn).toHaveBeenCalled()
})
