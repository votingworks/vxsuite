import { render, fireEvent, waitFor } from '@testing-library/react'
import { electionSampleDefinition as electionDefinition } from '@votingworks/fixtures'
import { Router } from 'react-router-dom'
import { createMemoryHistory } from 'history'
import fetchMock from 'fetch-mock'

import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils'
import { UsbDriveStatus } from '../lib/usbstick'
import ExportResultsModal from './ExportResultsModal'
import fakeFileWriter from '../../test/helpers/fakeFileWriter'

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting]

  for (const status of usbStatuses) {
    const closeFn = jest.fn()
    const { getByText, unmount } = render(
      <Router history={createMemoryHistory()}>
        <ExportResultsModal
          onClose={closeFn}
          usbDriveStatus={status}
          electionDefinition={electionDefinition}
          numberOfBallots={5}
          isTestMode
        />
      </Router>
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
    const { getByText, unmount, getByAltText } = render(
      <Router history={createMemoryHistory()}>
        <ExportResultsModal
          onClose={closeFn}
          usbDriveStatus={status}
          electionDefinition={electionDefinition}
          numberOfBallots={5}
          isTestMode
        />
      </Router>
    )
    getByText('No USB Drive Detected')
    getByText(
      'Please insert a USB drive in order to export the scanner results.'
    )
    getByAltText('Insert USB Image')

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalled()

    unmount()
  }
})

test('render export modal when a usb drive is mounted as expected and allows custom export', async () => {
  const mockKiosk = fakeKiosk()
  const fileWriter = fakeFileWriter()
  window.kiosk = mockKiosk
  const saveAsFunction = jest.fn().mockResolvedValue(fileWriter)
  mockKiosk.saveAs = saveAsFunction
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()])

  fetchMock.postOnce('/scan/export', {
    body: '',
  })

  const closeFn = jest.fn()
  const { getByText, getByAltText } = render(
    <Router history={createMemoryHistory()}>
      <ExportResultsModal
        onClose={closeFn}
        usbDriveStatus={UsbDriveStatus.mounted}
        electionDefinition={electionDefinition}
        numberOfBallots={5}
        isTestMode
      />
    </Router>
  )
  getByText('Export Results')
  getByText(
    /A CVR file will automatically be saved to the default location on the mounted USB drive. /
  )
  getByAltText('Insert USB Image')

  fireEvent.click(getByText('Custom'))
  await waitFor(() => getByText(/Download Complete/))
  await waitFor(() => {
    expect(saveAsFunction).toHaveBeenCalledTimes(1)
  })
  expect(fetchMock.called('/scan/export')).toBe(true)

  fireEvent.click(getByText('Cancel'))
  expect(closeFn).toHaveBeenCalled()
})

test('render export modal when a usb drive is mounted as expected and allows automatic export', async () => {
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()])

  fetchMock.postOnce('/scan/export', {
    body: '',
  })

  const closeFn = jest.fn()
  const { getByText } = render(
    <Router history={createMemoryHistory()}>
      <ExportResultsModal
        onClose={closeFn}
        usbDriveStatus={UsbDriveStatus.mounted}
        electionDefinition={electionDefinition}
        numberOfBallots={5}
        isTestMode
      />
    </Router>
  )
  getByText('Export Results')

  fireEvent.click(getByText('Export'))
  await waitFor(() => getByText(/Download Complete/))
  await waitFor(() => {
    expect(mockKiosk.makeDirectory).toHaveBeenCalledTimes(1)
  })
  expect(
    mockKiosk.makeDirectory
  ).toHaveBeenCalledWith(
    `fake mount point/cast-vote-records/franklin-county_general-election_${electionDefinition.electionHash.slice(
      0,
      10
    )}`,
    { recursive: true }
  )
  expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1)
  expect(fetchMock.called('/scan/export')).toBe(true)

  getByText('Eject USB')
  fireEvent.click(getByText('Cancel'))
  expect(closeFn).toHaveBeenCalled()
})

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk

  fetchMock.postOnce('/scan/export', {
    body: '',
  })

  const closeFn = jest.fn()
  const { getByText } = render(
    <Router history={createMemoryHistory()}>
      <ExportResultsModal
        onClose={closeFn}
        usbDriveStatus={UsbDriveStatus.mounted}
        electionDefinition={electionDefinition}
        numberOfBallots={5}
        isTestMode
      />
    </Router>
  )
  getByText('Export Results')

  mockKiosk.getUsbDrives.mockRejectedValueOnce(new Error('NOPE'))
  fireEvent.click(getByText('Export'))
  await waitFor(() => getByText(/Download Failed/))
  getByText(/Failed to save results./)
  getByText(/NOPE/)

  fireEvent.click(getByText('Close'))
  expect(closeFn).toHaveBeenCalled()
})
