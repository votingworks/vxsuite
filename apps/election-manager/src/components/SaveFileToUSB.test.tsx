import React from 'react'

import { fireEvent, waitFor } from '@testing-library/react'
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils'

import { UsbDriveStatus } from '../lib/usbstick'
import SaveFileToUSB, { FileType } from './SaveFileToUSB'
import renderInAppContext from '../../test/renderInAppContext'

test('renders loading screen when usb drive is mounting or ejecting in export modal', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting]

  for (const status of usbStatuses) {
    for (const fileType of Object.values(FileType)) {
      const closeFn = jest.fn()
      const { getByText, unmount } = renderInAppContext(
        <SaveFileToUSB
          onClose={closeFn}
          generateFileContent={jest.fn()}
          defaultFilename="file"
          fileType={fileType}
        />,
        {
          usbDriveStatus: status,
        }
      )
      getByText('Loading')
      unmount()
    }
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
      <SaveFileToUSB
        onClose={closeFn}
        generateFileContent={jest.fn()}
        defaultFilename="file"
        fileType={FileType.TestDeckTallyReport}
      />,
      {
        usbDriveStatus: status,
      }
    )
    getByText('No USB Drive Detected')
    getByText(
      'Please insert a USB drive where you would like the save the test deck tally report.'
    )
    getByAltText('Insert USB Image')

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalled()

    unmount()
  }
})

test('renders save screen when usb is mounted with ballot filetype', async () => {
  jest.useFakeTimers()
  const closeFn = jest.fn()
  const fileContentFn = jest
    .fn()
    .mockResolvedValueOnce('this-is-my-file-content')
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()])

  const { getByText, queryAllByText } = renderInAppContext(
    <SaveFileToUSB
      onClose={closeFn}
      generateFileContent={fileContentFn}
      defaultFilename="this-is-a-file-name.pdf"
      fileType={FileType.Ballot}
    />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
    }
  )
  getByText('Save Ballot')
  getByText(/Save the ballot as/)
  getByText('this-is-a-file-name.pdf')

  fireEvent.click(getByText('Save'))
  expect(fileContentFn).toHaveBeenCalled()
  jest.advanceTimersByTime(2001)
  await waitFor(() => getByText(/Ballot Saved/))
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1)
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      'fake mount point/this-is-a-file-name.pdf',
      'this-is-my-file-content'
    )
  })

  fireEvent.click(getByText('Close'))
  expect(closeFn).toHaveBeenCalled()

  // Does not show eject usb by default
  expect(queryAllByText('You may now eject the USB drive.')).toHaveLength(0)
  expect(queryAllByText('Eject USB')).toHaveLength(0)
})

test('renders save screen when usb is mounted with results filetype and prompts to eject usb', async () => {
  jest.useFakeTimers()
  const closeFn = jest.fn()
  const fileContentFn = jest
    .fn()
    .mockResolvedValueOnce('this-is-my-file-content')
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()])

  const { getByText } = renderInAppContext(
    <SaveFileToUSB
      onClose={closeFn}
      generateFileContent={fileContentFn}
      defaultFilename="this-is-a-file-name.pdf"
      fileType={FileType.Results}
      promptToEjectUSB
    />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
    }
  )
  getByText('Save Results')
  getByText(/Save the election results as/)
  getByText('this-is-a-file-name.pdf')

  fireEvent.click(getByText('Save'))
  expect(fileContentFn).toHaveBeenCalled()
  jest.advanceTimersByTime(2001)
  await waitFor(() => getByText(/Results Saved/))
  getByText(/Election results successfully saved/)
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1)
    expect(mockKiosk.writeFile).toHaveBeenNthCalledWith(
      1,
      'fake mount point/this-is-a-file-name.pdf',
      'this-is-my-file-content'
    )
  })

  fireEvent.click(getByText('Close'))
  expect(closeFn).toHaveBeenCalled()
  getByText('You may now eject the USB drive.')
  getByText('Eject USB')
})

test('render export modal with errors when appropriate', async () => {
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk

  const fileContentFn = jest
    .fn()
    .mockRejectedValueOnce(new Error('this-is-an-error'))

  const closeFn = jest.fn()
  const { getByText } = renderInAppContext(
    <SaveFileToUSB
      onClose={closeFn}
      generateFileContent={fileContentFn}
      defaultFilename="this-is-a-file-name.pdf"
      fileType={FileType.TallyReport}
    />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
    }
  )
  getByText('Save Unofficial Tally Report')

  fireEvent.click(getByText('Save'))
  await waitFor(() => getByText(/Failed to Save Unofficial Tally Report/))
  getByText(/Failed to save tally report./)
  getByText(/this-is-an-error/)

  fireEvent.click(getByText('Close'))
  expect(closeFn).toHaveBeenCalled()
})
