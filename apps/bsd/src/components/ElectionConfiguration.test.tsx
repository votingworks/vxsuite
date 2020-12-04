import { render, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import ElectionConfiguration from './ElectionConfiguration'
import { UsbDriveStatus } from '../lib/usbstick'
import fakeKiosk, { fakeUsbDrive } from '../../test/helpers/fakeKiosk'

test('shows loading screen when usb is mounting or ejecting', () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting]

  for (const status of usbStatuses) {
    const { getByText, unmount } = render(
      <ElectionConfiguration
        acceptManuallyChosenFile={jest.fn()}
        acceptAutomaticallyChosenFile={jest.fn()}
        usbDriveStatus={status}
      />
    )
    getByText('Loading')
    unmount()
  }
})

test('shows insert usb screen when no usb is present with manual upload button', async () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.notavailable,
    UsbDriveStatus.recentlyEjected,
  ]

  for (const status of usbStatuses) {
    const manualUpload = jest.fn()
    const { getByText, unmount, getByAltText, getByTestId } = render(
      <ElectionConfiguration
        acceptManuallyChosenFile={manualUpload}
        acceptAutomaticallyChosenFile={jest.fn()}
        usbDriveStatus={status}
      />
    )
    getByText('Not Configured')
    getByText(
      /Insert Election Admin card or a USB drive containing the Ballot Package archive from Election Manager in order to configure this machine./
    )
    getByAltText('Insert USB Image')
    getByText('Select Configuration File')

    fireEvent.change(getByTestId('manual-upload-input'), {
      target: { files: [new File(['file'], 'file.zip')] },
    })
    await waitFor(() => expect(manualUpload).toHaveBeenCalledTimes(1))

    unmount()
  }
})

test('reads files from usb when mounted and shows proper display when there are no matching files', async () => {
  const mockKiosk = fakeKiosk()
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()])
  mockKiosk.getFileSystemEntries = jest.fn().mockResolvedValue([])
  window.kiosk = mockKiosk
  const manualUpload = jest.fn()
  const { getByText, queryAllByText, getByTestId } = render(
    <ElectionConfiguration
      acceptManuallyChosenFile={manualUpload}
      acceptAutomaticallyChosenFile={jest.fn()}
      usbDriveStatus={UsbDriveStatus.mounted}
    />
  )

  await waitFor(() => getByText('No Ballot Packages Found'))
  getByText(
    /No ballot packages were automatically found on the inserted USB device/
  )
  getByText('Select Configuration File')
  expect(queryAllByText('Eject USB')).toHaveLength(2)

  fireEvent.change(getByTestId('manual-upload-input'), {
    target: { files: [new File(['file'], 'file.zip')] },
  })
  await waitFor(() => expect(manualUpload).toHaveBeenCalledTimes(1))
})

test('reads files from usb when mounted and shows list of files', async () => {
  const file1 =
    'choctaw-county_2020-general-election_a5753d5776__2020-12-02_09-42-50.zip'
  const file2 =
    'king-county_2020-general-election_a123456789__2020-11-02_09-42-50.zip'
  const mockKiosk = fakeKiosk()
  mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()])
  mockKiosk.getFileSystemEntries = jest.fn().mockResolvedValue([
    { name: file1, type: 1 },
    { name: file2, type: 1 },
  ])
  window.kiosk = mockKiosk
  const automaticUpload = jest.fn()
  const { getByText, queryAllByText } = render(
    <ElectionConfiguration
      acceptManuallyChosenFile={jest.fn()}
      acceptAutomaticallyChosenFile={automaticUpload}
      usbDriveStatus={UsbDriveStatus.mounted}
    />
  )

  await waitFor(() => getByText('Choose Election Configuration'))
  expect(
    getByText(/choctaw county/)
      .closest('button')!
      .getAttribute('data-selected')
  ).toBe('false')
  expect(
    getByText(/king county/)
      .closest('button')!
      .getAttribute('data-selected')
  ).toBe('false')
  expect(queryAllByText(/2020 general election/)).toHaveLength(2)
  getByText('Election ID : a5753d5776')
  getByText('Election ID : a123456789')
  getByText('Exported On 12/2/2020, 9:42:50 AM')
  getByText('Exported On 11/2/2020, 9:42:50 AM')
  expect(getByText('Configure').closest('button')!.disabled).toBe(true)

  fireEvent.click(getByText(/choctaw county/).closest('button')!)
  expect(
    getByText(/choctaw county/)
      .closest('button')!
      .getAttribute('data-selected')
  ).toBe('true')
  expect(
    getByText(/king county/)
      .closest('button')!
      .getAttribute('data-selected')
  ).toBe('false')
  expect(getByText('Configure').closest('button')!.disabled).toBe(false)

  fireEvent.click(getByText(/choctaw county/).closest('button')!)
  expect(
    getByText(/choctaw county/)
      .closest('button')!
      .getAttribute('data-selected')
  ).toBe('false')
  expect(getByText('Configure').closest('button')!.disabled).toBe(true)

  fireEvent.click(getByText(/choctaw county/).closest('button')!)
  fireEvent.click(getByText(/king county/).closest('button')!)
  expect(
    getByText(/king county/)
      .closest('button')!
      .getAttribute('data-selected')
  ).toBe('true')
  expect(
    getByText(/choctaw county/)
      .closest('button')!
      .getAttribute('data-selected')
  ).toBe('false')
  expect(getByText('Configure').closest('button')!.disabled).toBe(false)

  fireEvent.click(getByText('Configure'))
  expect(automaticUpload).toHaveBeenCalledTimes(1)
  expect(automaticUpload).toHaveBeenCalledWith({ name: file2, type: 1 })
})
