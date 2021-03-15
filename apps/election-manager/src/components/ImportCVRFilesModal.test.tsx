import React from 'react'
import {
  waitFor,
  fireEvent,
  getByText as domGetByText,
} from '@testing-library/react'

import ImportCVRFilesModal from './ImportCVRFilesModal'
import renderInAppContext, {
  eitherNeitherElectionDefinition,
} from '../../test/renderInAppContext'
import { UsbDriveStatus } from '../lib/usbstick'
import fakeKiosk, { fakeUsbDrive } from '../../test/helpers/fakeKiosk'
import CastVoteRecordFiles from '../utils/CastVoteRecordFiles'
import { CastVoteRecord } from '../config/types'
import * as GLOBALS from '../config/globals'

const TEST_FILE1 = 'TEST__machine_0001__10_ballots__2020-12-09_15-49-32.jsonl'
const TEST_FILE2 = 'TEST__machine_0003__5_ballots__2020-12-07_15-49-32.jsonl'
const LIVE_FILE1 = 'machine_0002__10_ballots__2020-12-09_15-59-32.jsonl'

test('No USB screen shows when there is no USB drive', async () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.recentlyEjected,
    UsbDriveStatus.notavailable,
  ]

  for (const usbStatus of usbStatuses) {
    const closeFn = jest.fn()
    const { unmount, getByText } = renderInAppContext(
      <ImportCVRFilesModal onClose={closeFn} />,
      { usbDriveStatus: usbStatus }
    )
    getByText('No USB Drive Detected')

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)
    unmount()
  }
})

test('Loading screen show while usb is mounting or ejecting', async () => {
  const usbStatuses = [UsbDriveStatus.present, UsbDriveStatus.ejecting]

  for (const usbStatus of usbStatuses) {
    const closeFn = jest.fn()
    const { unmount, getByText } = renderInAppContext(
      <ImportCVRFilesModal onClose={closeFn} />,
      { usbDriveStatus: usbStatus }
    )
    getByText('Loading')
    unmount()
  }
})

describe('Screens display properly when USB is mounted', () => {
  beforeEach(() => {
    const mockKiosk = fakeKiosk()
    mockKiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()])
    window.kiosk = mockKiosk
  })

  afterEach(() => {
    delete window.kiosk
  })

  test('No files found screen shows when mounted usb has no valid files', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const { getByText, getByTestId } = renderInAppContext(
      <ImportCVRFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        saveCastVoteRecordFiles: saveCVR,
      }
    )
    await waitFor(() =>
      getByText(
        /There were no new CVR files automatically found on this USB drive/
      )
    )

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)

    // You can still manually import files
    fireEvent.change(getByTestId('manual-input'), {
      target: { files: [new File([''], 'file.jsonl')] },
    })
    await waitFor(() => expect(closeFn).toHaveBeenCalledTimes(2))
    expect(saveCVR).toHaveBeenCalledTimes(1)
  })

  test('Import CVR files screen shows table with test and live CVRs', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const fileEntries = [
      {
        name: LIVE_FILE1,
        type: 1,
        path: 'live1',
      },
      {
        name: TEST_FILE1,
        type: 1,
        path: 'test1',
      },
      {
        name: TEST_FILE2,
        type: 1,
        path: 'test2',
      },
    ]
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(fileEntries)
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCVRFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        saveCastVoteRecordFiles: saveCVR,
      }
    )
    await waitFor(() => getByText('Import CVR Files'))
    getByText(
      /The following CVR files were automatically found on this USB drive./
    )

    const tableRows = getAllByTestId('table-row')
    expect(tableRows).toHaveLength(3)
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM')
    domGetByText(tableRows[0], '0002')
    expect(
      domGetByText(tableRows[0], 'Select').closest('button')!.disabled
    ).toBe(false)
    domGetByText(tableRows[1], '12/09/2020 03:49:32 PM')
    domGetByText(tableRows[1], '0001')
    expect(
      domGetByText(tableRows[1], 'Select').closest('button')!.disabled
    ).toBe(false)
    domGetByText(tableRows[2], '12/07/2020 03:49:32 PM')
    domGetByText(tableRows[2], '0003')
    expect(
      domGetByText(tableRows[2], 'Select').closest('button')!.disabled
    ).toBe(false)

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)

    fireEvent.click(domGetByText(tableRows[0], 'Select'))
    getByText('Loading')
    await waitFor(() => {
      expect(saveCVR).toHaveBeenCalledTimes(1)
      expect(window.kiosk!.readFile).toHaveBeenCalledTimes(1)
      expect(window.kiosk!.readFile).toHaveBeenNthCalledWith(
        1,
        'live1',
        'utf-8'
      )
      // When the import is successful the modal should automatically be closed.
      expect(closeFn).toHaveBeenCalledTimes(2)
    })
  })

  test('Can import a test CVR when both live and test CVRs are loaded', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const fileEntries = [
      {
        name: LIVE_FILE1,
        type: 1,
        path: 'live1',
      },
      {
        name: TEST_FILE1,
        type: 1,
        path: 'test1',
      },
      {
        name: TEST_FILE2,
        type: 1,
        path: 'test2',
      },
    ]
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(fileEntries)
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCVRFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        saveCastVoteRecordFiles: saveCVR,
      }
    )
    await waitFor(() => getByText('Import CVR Files'))
    getByText(
      /The following CVR files were automatically found on this USB drive./
    )

    const tableRows = getAllByTestId('table-row')
    expect(tableRows).toHaveLength(3)

    window.kiosk!.readFile = jest
      .fn()
      .mockResolvedValueOnce('invalid-file-contents')
    fireEvent.click(domGetByText(tableRows[1], 'Select'))
    getByText('Loading')
    await waitFor(() => {
      expect(saveCVR).toHaveBeenCalledTimes(1)
      expect(window.kiosk!.readFile).toHaveBeenCalledTimes(1)
      expect(window.kiosk!.readFile).toHaveBeenNthCalledWith(
        1,
        'test1',
        'utf-8'
      )
      // There should be an error importing the file.
      getByText('Error')
      getByText(/There was an error reading the content of the file/)
    })
  })

  test('Import CVR files screen locks to test mode when test files have been imported', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const fileEntries = [
      {
        name: LIVE_FILE1,
        type: 1,
        path: 'live1',
      },
      {
        name: TEST_FILE1,
        type: 1,
        path: 'test1',
      },
      {
        name: TEST_FILE2,
        type: 1,
        path: 'test2',
      },
    ]
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(fileEntries)
    const cvr: CastVoteRecord = {
      _ballotId: 'abc',
      _ballotStyleId: '5',
      _ballotType: 'standard',
      _precinctId: '6522',
      _testBallot: true,
      _scannerId: 'abc',
    }
    const mockFiles = CastVoteRecordFiles.empty
    const added = await mockFiles.addAll(
      [new File([JSON.stringify(cvr)], TEST_FILE1)],
      eitherNeitherElectionDefinition.election
    )
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCVRFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        castVoteRecordFiles: added,
        saveCastVoteRecordFiles: saveCVR,
      }
    )
    await waitFor(() => getByText('Import Test Mode CVR Files'))

    const tableRows = getAllByTestId('table-row')
    expect(tableRows).toHaveLength(2)
    domGetByText(tableRows[0], '12/09/2020 03:49:32 PM')
    domGetByText(tableRows[0], '0001')
    domGetByText(tableRows[0], GLOBALS.CHECK_ICON) // Check that the previously imported file is marked as selected
    expect(
      domGetByText(tableRows[0], 'Select').closest('button')!.disabled
    ).toBe(true)
    domGetByText(tableRows[1], '12/07/2020 03:49:32 PM')
    domGetByText(tableRows[1], '0003')
    expect(
      domGetByText(tableRows[1], 'Select').closest('button')!.disabled
    ).toBe(false)

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)

    window.kiosk!.readFile = jest
      .fn()
      .mockResolvedValueOnce(JSON.stringify(cvr))

    fireEvent.click(domGetByText(tableRows[1], 'Select'))
    getByText('Loading')
    await waitFor(() => {
      expect(saveCVR).toHaveBeenCalledTimes(1)
      expect(window.kiosk!.readFile).toHaveBeenCalledTimes(1)
      expect(window.kiosk!.readFile).toHaveBeenNthCalledWith(
        1,
        'test2',
        'utf-8'
      )
      // There should be a message about importing a duplicate file displayed.
      getByText('Duplicate File')
      getByText(
        'The selected file was ignored as a duplicate of a previously imported file.'
      )
    })
  })

  test('Import CVR files screen locks to live mode when live files have been imported', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const fileEntries = [
      {
        name: LIVE_FILE1,
        type: 1,
        path: 'live1',
      },
      {
        name: TEST_FILE1,
        type: 1,
        path: 'test1',
      },
      {
        name: TEST_FILE2,
        type: 1,
        path: 'test2',
      },
    ]
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(fileEntries)
    const cvr: CastVoteRecord = {
      _ballotId: 'abc',
      _ballotStyleId: '5',
      _ballotType: 'standard',
      _precinctId: '6522',
      _testBallot: false,
      _scannerId: 'abc',
    }
    const mockFiles = CastVoteRecordFiles.empty
    const added = await mockFiles.addAll(
      [new File([JSON.stringify(cvr)], 'randomname')],
      eitherNeitherElectionDefinition.election
    )
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCVRFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        castVoteRecordFiles: added,
        saveCastVoteRecordFiles: saveCVR,
      }
    )
    await waitFor(() => getByText('Import Live Mode CVR Files'))

    const tableRows = getAllByTestId('table-row')
    expect(tableRows).toHaveLength(1)
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM')
    domGetByText(tableRows[0], '0002')
    expect(
      domGetByText(tableRows[0], 'Select').closest('button')!.disabled
    ).toBe(false)

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)

    fireEvent.click(domGetByText(tableRows[0], 'Select'))
    getByText('Loading')
    await waitFor(() => {
      expect(saveCVR).toHaveBeenCalledTimes(1)
      expect(window.kiosk!.readFile).toHaveBeenCalledTimes(1)
      expect(window.kiosk!.readFile).toHaveBeenNthCalledWith(
        1,
        'live1',
        'utf-8'
      )
      expect(closeFn).toHaveBeenCalledTimes(2)
    })
  })

  test('Shows previously imported files when all files have already been imported', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const fileEntries = [
      {
        name: LIVE_FILE1,
        type: 1,
        path: 'live1',
      },
    ]
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(fileEntries)
    const cvr: CastVoteRecord = {
      _ballotId: 'abc',
      _ballotStyleId: '5',
      _ballotType: 'standard',
      _precinctId: '6522',
      _testBallot: false,
      _scannerId: 'abc',
    }
    const mockFiles = CastVoteRecordFiles.empty
    const added = await mockFiles.addAll(
      [new File([JSON.stringify(cvr)], LIVE_FILE1)],
      eitherNeitherElectionDefinition.election
    )
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCVRFilesModal onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        castVoteRecordFiles: added,
        saveCastVoteRecordFiles: saveCVR,
      }
    )
    await waitFor(() => getByText('Import Live Mode CVR Files'))
    getByText(
      /There were no new CVR files automatically found on this USB drive./
    )

    const tableRows = getAllByTestId('table-row')
    expect(tableRows).toHaveLength(1)
    domGetByText(tableRows[0], '12/09/2020 03:59:32 PM')
    domGetByText(tableRows[0], '0002')
    domGetByText(tableRows[0], GLOBALS.CHECK_ICON)
    expect(
      domGetByText(tableRows[0], 'Select').closest('button')!.disabled
    ).toBe(true)

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)
  })
})
