import React from 'react'
import {
  waitFor,
  fireEvent,
  getByText as domGetByText,
} from '@testing-library/react'

import ImportCVRFilesModal from './ImportCVRFilesModal'
import renderInAppContext, {
  defaultElectionDefinition,
} from '../../test/renderInAppContext'
import { UsbDriveStatus } from '../lib/usbstick'
import fakeKiosk, { fakeUsbDrive } from '../../test/helpers/fakeKiosk'
import CastVoteRecordFiles from '../utils/CastVoteRecordFiles'
import { CastVoteRecord } from '../config/types'
import * as GLOBALS from '../config/globals'

const TEST_FILE1 = 'TEST__machine_0001__10_ballots__2020-12-09_15-49-32.jsonl'
const TEST_FILE2 = 'TEST__machine_0003__5_ballots__2020-12-07_15-49-32.jsonl'
const LIVE_FILE1 = 'machine_0002__10_ballots__2020-12-09_15-49-32.jsonl'

test('No USB screen shows when there is no USB drive', async () => {
  const usbStatuses = [
    UsbDriveStatus.absent,
    UsbDriveStatus.recentlyEjected,
    UsbDriveStatus.notavailable,
  ]

  for (const usbStatus of usbStatuses) {
    const closeFn = jest.fn()
    const { unmount, getByText } = renderInAppContext(
      <ImportCVRFilesModal isOpen onClose={closeFn} />,
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
      <ImportCVRFilesModal isOpen onClose={closeFn} />,
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
      <ImportCVRFilesModal isOpen onClose={closeFn} />,
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
      target: { files: [new File(['file'], 'file.jsonl')] },
    })
    await waitFor(() => expect(closeFn).toHaveBeenCalledTimes(2))
    expect(saveCVR).toHaveBeenCalledTimes(1)
  })

  test('Import Test Mode CVR files screen shows when only test CVRs are found', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const readFile = jest.fn()
    window.kiosk!.readFile = readFile
    const fileEntries = [
      {
        name: TEST_FILE2,
        type: 1,
      },
      {
        name: TEST_FILE1,
        type: 1,
      },
    ]
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(fileEntries)
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCVRFilesModal isOpen onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        saveCastVoteRecordFiles: saveCVR,
      }
    )
    await waitFor(() => getByText('Import Test Mode CVR Files'))
    getByText(/No live mode CVRs were found/)

    const tableRows = getAllByTestId('table-row')
    expect(tableRows).toHaveLength(2)
    // Files should be sorted by export date
    domGetByText(tableRows[0], '12/09/2020 03:49:32 PM')
    domGetByText(tableRows[0], '0001')
    domGetByText(tableRows[1], '12/07/2020 03:49:32 PM')
    domGetByText(tableRows[1], '0003')

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)

    fireEvent.click(getByText('Import 2 New Files'))
    getByText('Loading')
    waitFor(() => {
      expect(saveCVR).toHaveBeenCalledTimes(1)
      expect(readFile).toHaveBeenCalledTimes(2)
    })
  })

  test('Import Live Mode CVR files screen shows when only live CVRs are found', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const readFile = jest.fn()
    window.kiosk!.readFile = readFile
    const fileEntries = [
      {
        name: LIVE_FILE1,
        type: 1,
      },
    ]
    window.kiosk!.getFileSystemEntries = jest
      .fn()
      .mockResolvedValue(fileEntries)
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCVRFilesModal isOpen onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        saveCastVoteRecordFiles: saveCVR,
      }
    )
    await waitFor(() => getByText('Import Live Mode CVR Files'))
    getByText(/No test mode CVRs were found/)

    const tableRows = getAllByTestId('table-row')
    expect(tableRows).toHaveLength(1)
    domGetByText(tableRows[0], '12/09/2020 03:49:32 PM')
    domGetByText(tableRows[0], '0002')

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)

    fireEvent.click(getByText('Import 1 New File'))
    getByText('Loading')
    await waitFor(() => {
      expect(saveCVR).toHaveBeenCalledTimes(1)
      expect(readFile).toHaveBeenCalledTimes(1)
    })
  })

  test('Import CVR files screen shows toggle between modes when only both CVRs are found', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const readFile = jest.fn()
    window.kiosk!.readFile = readFile
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
      <ImportCVRFilesModal isOpen onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        saveCastVoteRecordFiles: saveCVR,
      }
    )
    await waitFor(() => getByText('Import CVR Files'))
    getByText(/This USB drive contains both test mode and live mode CVR files/)

    // Live ballots selected by default
    expect(getByText('Live Ballots').closest('button')!.disabled).toBe(true)
    expect(getByText('Test Ballots').closest('button')!.disabled).toBe(false)

    let tableRows = getAllByTestId('table-row')
    expect(tableRows).toHaveLength(1)
    domGetByText(tableRows[0], '12/09/2020 03:49:32 PM')
    domGetByText(tableRows[0], '0002')
    getByText('Import 1 New File')

    fireEvent.click(getByText('Test Ballots'))
    tableRows = getAllByTestId('table-row')
    expect(tableRows).toHaveLength(2)
    domGetByText(tableRows[0], '12/09/2020 03:49:32 PM')
    domGetByText(tableRows[0], '0001')
    domGetByText(tableRows[1], '12/07/2020 03:49:32 PM')
    domGetByText(tableRows[1], '0003')
    getByText('Import 2 New Files')

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)

    fireEvent.click(getByText('Import 2 New Files'))
    getByText('Loading')
    await waitFor(() => {
      expect(saveCVR).toHaveBeenCalledTimes(1)
      expect(readFile).toHaveBeenCalledTimes(2)
      expect(readFile.mock.calls[0]).toEqual(['test1', 'utf-8'])
      expect(readFile.mock.calls[1]).toEqual(['test2', 'utf-8'])
    })
  })

  test('Import CVR files screen locks to test mode when test files have been imported', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const readFile = jest.fn()
    window.kiosk!.readFile = readFile
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
      defaultElectionDefinition.election
    )
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCVRFilesModal isOpen onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        castVoteRecordFiles: added,
        saveCastVoteRecordFiles: saveCVR,
      }
    )
    await waitFor(() => getByText('Import Test Mode CVR Files'))
    getByText(
      /Since test mode CVR files have been previously imported to Election Manager you must remove those files in order to import live mode CVR files./
    )

    const tableRows = getAllByTestId('table-row')
    expect(tableRows).toHaveLength(2)
    domGetByText(tableRows[0], '12/09/2020 03:49:32 PM')
    domGetByText(tableRows[0], '0001')
    domGetByText(tableRows[0], GLOBALS.CHECK_ICON) // Check that the previously imported file is marked as selected
    domGetByText(tableRows[1], '12/07/2020 03:49:32 PM')
    domGetByText(tableRows[1], '0003')
    getByText('Import 1 New File')

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)

    fireEvent.click(getByText('Import 1 New File'))
    getByText('Loading')
    await waitFor(() => {
      expect(saveCVR).toHaveBeenCalledTimes(1)
      expect(readFile).toHaveBeenCalledTimes(1)
      expect(readFile.mock.calls[0]).toEqual(['test2', 'utf-8'])
    })
  })

  test('Import CVR files screen locks to live mode when live files have been imported', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const readFile = jest.fn()
    window.kiosk!.readFile = readFile
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
      defaultElectionDefinition.election
    )
    const { getByText, getAllByTestId } = renderInAppContext(
      <ImportCVRFilesModal isOpen onClose={closeFn} />,
      {
        usbDriveStatus: UsbDriveStatus.mounted,
        castVoteRecordFiles: added,
        saveCastVoteRecordFiles: saveCVR,
      }
    )
    await waitFor(() => getByText('Import Live Mode CVR Files'))
    getByText(
      /Since live mode CVR files have been previously imported to Election Manager you must remove those files in order to import test mode CVR files./
    )

    const tableRows = getAllByTestId('table-row')
    expect(tableRows).toHaveLength(1)
    domGetByText(tableRows[0], '12/09/2020 03:49:32 PM')
    domGetByText(tableRows[0], '0002')
    getByText('Import 1 New File')

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)

    fireEvent.click(getByText('Import 1 New File'))
    getByText('Loading')
    await waitFor(() => {
      expect(saveCVR).toHaveBeenCalledTimes(1)
      expect(readFile).toHaveBeenCalledTimes(1)
      expect(readFile.mock.calls[0]).toEqual(['live1', 'utf-8'])
    })
  })

  test('Shows previously imported files when all files have already been imported', async () => {
    const closeFn = jest.fn()
    const saveCVR = jest.fn()
    const readFile = jest.fn()
    window.kiosk!.readFile = readFile
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
      defaultElectionDefinition.election
    )
    const { getByText, getAllByTestId, queryAllByText } = renderInAppContext(
      <ImportCVRFilesModal isOpen onClose={closeFn} />,
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
    domGetByText(tableRows[0], '12/09/2020 03:49:32 PM')
    domGetByText(tableRows[0], '0002')
    domGetByText(tableRows[0], GLOBALS.CHECK_ICON)
    expect(queryAllByText('Import 1 New File')).toHaveLength(0)

    fireEvent.click(getByText('Cancel'))
    expect(closeFn).toHaveBeenCalledTimes(1)
  })
})
