import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react'
import fakeKiosk from '../../test/helpers/fakeKiosk'
import renderInAppContext from '../../test/renderInAppContext'
import ExportElectionBallotPackageModalButton from './ExportElectionBallotPackageModalButton'
import { UsbDriveStatus } from '../lib/usbstick'
import fakeFileWriter from '../../test/helpers/fakeFileWriter'

jest.mock('../components/HandMarkedPaperBallot')

beforeAll(() => {
  window.kiosk = fakeKiosk()
})

afterAll(() => {
  delete window.kiosk
})

test('Button renders properly when not clicked', async () => {
  const { queryByText, queryByTestId } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />
  )

  expect(queryByText('Export Ballot Package')).toHaveProperty('type', 'button')
  expect(queryByTestId('modal')).toBeNull()
})

test('Modal renders insert usb screen appropriately', async () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.recentlyEjected,
    UsbDriveStatus.notavailable,
  ]

  for (const usbStatus of usbStatuses) {
    const {
      unmount,
      getByText,
      queryAllByText,
      queryAllByAltText,
      queryAllByTestId,
    } = renderInAppContext(<ExportElectionBallotPackageModalButton />, {
      usbDriveStatus: usbStatus,
    })
    fireEvent.click(getByText('Export Ballot Package'))
    await waitFor(() => getByText('No USB Drive Detected'))
    expect(queryAllByAltText('Insert USB Image')).toHaveLength(1)
    expect(queryAllByTestId('modal')).toHaveLength(1)
    expect(
      queryAllByText(
        'Please insert a USB drive in order to export the ballot configuration.'
      )
    ).toHaveLength(1)

    fireEvent.click(getByText('Cancel'))
    expect(queryAllByTestId('modal')).toHaveLength(0)

    unmount()
  }
})

test('Modal renders export confirmation screen when usb detected and manual link works as expected', async () => {
  const mockKiosk = fakeKiosk()
  const fileWriter = fakeFileWriter()
  window.kiosk = mockKiosk
  const saveAsFunction = jest.fn().mockResolvedValue(fileWriter)
  mockKiosk.saveAs = saveAsFunction
  const {
    getByText,
    queryAllByText,
    queryAllByAltText,
    queryAllByTestId,
  } = renderInAppContext(<ExportElectionBallotPackageModalButton />, {
    usbDriveStatus: UsbDriveStatus.mounted,
  })
  fireEvent.click(getByText('Export Ballot Package'))
  await waitFor(() =>
    expect(queryAllByText('Export Ballot Package')).toHaveLength(2)
  )
  expect(queryAllByAltText('Insert USB Image')).toHaveLength(1)
  expect(queryAllByTestId('modal')).toHaveLength(1)
  expect(
    queryAllByText(/Would you like to export the ballot configuration now?/)
  ).toHaveLength(1)
  expect(
    queryAllByText(
      /A zip archive will automatically be saved to the default location on the mounted USB drive./
    )
  ).toHaveLength(1)
  expect(
    queryAllByText(/Optionally, you may pick a custom export location./)
  ).toHaveLength(1)

  fireEvent.click(getByText('Custom'))
  await waitFor(() => getByText(/Download Complete/))
  await waitFor(() => {
    expect(saveAsFunction).toHaveBeenCalledTimes(1)
  })

  fireEvent.click(getByText('Cancel'))
  expect(queryAllByTestId('modal')).toHaveLength(0)
})

test('Modal renders loading screen when usb drive is mounting or ejecting', async () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting]

  for (const usbStatus of usbStatuses) {
    const { unmount, queryAllByTestId, getByText } = renderInAppContext(
      <ExportElectionBallotPackageModalButton />,
      {
        usbDriveStatus: usbStatus,
      }
    )
    fireEvent.click(getByText('Export Ballot Package'))
    await waitFor(() => getByText('Loading'))

    expect(queryAllByTestId('modal')).toHaveLength(1)

    expect(getByText('Cancel')).toBeDisabled()
    unmount()
  }
})

test('Modal renders error message appropriately', async () => {
  const { queryAllByTestId, getByText, queryAllByText } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
    }
  )
  fireEvent.click(getByText('Export Ballot Package'))
  await waitFor(() => getByText('Export'))

  fireEvent.click(getByText('Export'))

  await waitFor(() => getByText(/Download Failed!/))
  expect(queryAllByTestId('modal')).toHaveLength(1)
  expect(queryAllByText(/An error occurred:/)).toHaveLength(1)
  expect(
    queryAllByText(/could not begin download; no file was chosen/)
  ).toHaveLength(1)

  fireEvent.click(getByText('Close'))
  expect(queryAllByTestId('modal')).toHaveLength(0)
})

test('Modal renders renders loading message while rendering ballots appropriately', async () => {
  const mockKiosk = fakeKiosk()
  const fileWriter = fakeFileWriter()
  window.kiosk = mockKiosk
  const saveAsFunction = jest.fn().mockResolvedValue(fileWriter)
  mockKiosk.saveAs = saveAsFunction
  const ejectFunction = jest.fn()
  const { queryAllByTestId, getByText, queryAllByText } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
      usbDriveEject: ejectFunction,
    }
  )
  fireEvent.click(getByText('Export Ballot Package'))
  await waitFor(() => getByText('Export'))

  fireEvent.click(getByText('Export'))

  await waitFor(() => getByText(/Download Complete/))
  expect(saveAsFunction).toHaveBeenCalledTimes(1)

  expect(queryAllByTestId('modal')).toHaveLength(1)
  expect(
    queryAllByText(
      /You may now eject the USB device and connect it with your ballot scanning machine to configure it./
    )
  )

  expect(queryAllByText('Eject USB')).toHaveLength(1)
  fireEvent.click(getByText('Eject USB'))
  expect(ejectFunction).toHaveBeenCalledTimes(1)

  fireEvent.click(getByText('Cancel'))
  expect(queryAllByTestId('modal')).toHaveLength(0)
})
