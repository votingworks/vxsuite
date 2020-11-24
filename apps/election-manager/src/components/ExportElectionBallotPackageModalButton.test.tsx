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
  const { container } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />
  )

  expect(container).toMatchInlineSnapshot(`
    <div>
      <button
        class="sc-AxhCb dkvhmn"
        role="option"
        type="button"
      >
        Export Ballot Package
      </button>
    </div>
  `)
})

test('Modal renders insert usb screen appropriately', async () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.recentlyEjected,
    UsbDriveStatus.notavailable,
  ]

  for (const usbStatus of usbStatuses) {
    const { unmount, getByTestId, getByText } = renderInAppContext(
      <ExportElectionBallotPackageModalButton />,
      {
        usbDriveStatus: usbStatus,
      }
    )
    fireEvent.click(getByText('Export Ballot Package'))
    await waitFor(() => getByText('No USB Drive Detected'))

    expect(getByTestId('modal')).toMatchSnapshot()
    unmount()
  }
})

test('Modal renders export confirmation screen when usb detected', async () => {
  const { getByTestId, getByText } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
    }
  )
  fireEvent.click(getByText('Export Ballot Package'))
  await waitFor(() => getByText('USB Drive Detected!'))

  expect(getByTestId('modal')).toMatchSnapshot()
})

test('Modal renders loading screen when usb is mounting or ejecting', async () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting]

  for (const usbStatus of usbStatuses) {
    const { unmount, getByTestId, getByText } = renderInAppContext(
      <ExportElectionBallotPackageModalButton />,
      {
        usbDriveStatus: usbStatus,
      }
    )
    fireEvent.click(getByText('Export Ballot Package'))
    await waitFor(() => getByText('Loading'))

    expect(getByTestId('modal')).toMatchSnapshot()
    unmount()
  }
})

test('Modal renders error message appropriately', async () => {
  const { getByTestId, getByText } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
    }
  )
  fireEvent.click(getByText('Export Ballot Package'))
  await waitFor(() => getByText('USB Drive Detected!'))

  fireEvent.click(getByText('Export'))

  await waitFor(() => getByText(/Download Failed!/))

  expect(getByTestId('modal')).toMatchSnapshot()
})

test('Modal renders renders loading message while rendering ballots appropriately', async () => {
  const mockKiosk = fakeKiosk()
  const fileWriter = fakeFileWriter()
  window.kiosk = mockKiosk
  const saveAsFunction = jest.fn().mockResolvedValue(fileWriter)
  mockKiosk.saveAs = saveAsFunction
  const { getByTestId, getByText } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />,
    {
      usbDriveStatus: UsbDriveStatus.mounted,
    }
  )
  fireEvent.click(getByText('Export Ballot Package'))
  await waitFor(() => getByText('USB Drive Detected!'))

  fireEvent.click(getByText('Export'))

  await waitFor(() => getByText(/Download Complete/))
  expect(saveAsFunction).toHaveBeenCalledTimes(1)

  expect(getByTestId('modal')).toMatchSnapshot()
})
