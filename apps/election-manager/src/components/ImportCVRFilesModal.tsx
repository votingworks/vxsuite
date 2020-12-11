import React, { useContext, useEffect, useState } from 'react'
import styled from 'styled-components'
import path from 'path'
import moment from 'moment'

import AppContext from '../contexts/AppContext'
import Modal from './Modal'
import Button, { SegmentedButton } from './Button'
import Prose from './Prose'
import LinkButton from './LinkButton'
import Loading from './Loading'
import { UsbDriveStatus, getDevicePath } from '../lib/usbstick'
import {
  generateElectionBasedSubfolderName,
  parseCVRFileInfoFromFilename,
  SCANNER_RESULTS_FOLDER,
} from '../utils/filenames'
import { InputEventFunction } from '../config/types'
import FileInputButton from './FileInputButton'
import Table, { TD } from './Table'
import { MainChild } from './Main'
import * as GLOBALS from '../config/globals'

const CVRFileTable = styled(Table)`
  margin-top: 20px;
`

const CheckTD = styled(TD)`
  line-height: 1rem;
  color: rgb(71, 167, 75);
  font-size: 1.5rem;
  font-weight: 700;
`

const USBImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`

const Header = styled.h1`
  display: flex;
  justify-content: space-between;
`

export interface Props {
  isOpen: boolean
  onClose: () => void
}

function throwBadStatus(s: never): never {
  throw new Error(`Bad status: ${s}`)
}

const ImportCVRFilesModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    usbDriveStatus,
    saveCastVoteRecordFiles,
    castVoteRecordFiles,
    electionDefinition,
  } = useContext(AppContext)
  const [isLoading, setIsLoading] = useState(false)
  const [foundFiles, setFoundFiles] = useState<KioskBrowser.FileSystemEntry[]>(
    []
  )
  const [isToggledToTestMode, setIsToggledToTestMode] = useState(false)

  const { election, electionHash } = electionDefinition!

  const importSelectedFiles = async (
    fileEntries: KioskBrowser.FileSystemEntry[]
  ) => {
    setIsLoading(true)
    const newCastVoteRecordFiles = await castVoteRecordFiles.addAllFromFileSystemEntries(
      fileEntries,
      election
    )
    saveCastVoteRecordFiles(newCastVoteRecordFiles)
    setIsLoading(false)

    onClose()
  }

  const processCastVoteRecordFilesFromFilePicker: InputEventFunction = async (
    event
  ) => {
    const input = event.currentTarget
    const files = Array.from(input.files || [])
    setIsLoading(true)

    const newCastVoteRecordFiles = await castVoteRecordFiles.addAll(
      files,
      election
    )
    saveCastVoteRecordFiles(newCastVoteRecordFiles)

    setIsLoading(false)
    input.value = ''
    onClose()
  }

  const fetchFilenames = async () => {
    setIsLoading(true)
    const usbPath = await getDevicePath()
    try {
      const files = await window.kiosk!.getFileSystemEntries(
        path.join(
          usbPath!,
          SCANNER_RESULTS_FOLDER,
          generateElectionBasedSubfolderName(election, electionHash)
        )
      )
      setFoundFiles(
        files.filter((f) => f.type === 1 && f.name.endsWith('.jsonl'))
      )
      setIsLoading(false)
    } catch (err) {
      if (err.message.includes('ENOENT')) {
        // No files found
        setFoundFiles([])
        setIsLoading(false)
      } else {
        throw err
      }
    }
  }

  useEffect(() => {
    if (usbDriveStatus === UsbDriveStatus.mounted) {
      fetchFilenames()
    }
  }, [usbDriveStatus])

  if (
    isLoading ||
    usbDriveStatus === UsbDriveStatus.ejecting ||
    usbDriveStatus === UsbDriveStatus.present
  ) {
    return (
      <Modal
        isOpen={isOpen}
        content={<Loading />}
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <LinkButton onPress={onClose} disabled>
              Cancel
            </LinkButton>
          </React.Fragment>
        }
      />
    )
  }

  if (
    usbDriveStatus === UsbDriveStatus.absent ||
    usbDriveStatus === UsbDriveStatus.notavailable ||
    usbDriveStatus === UsbDriveStatus.recentlyEjected
  ) {
    return (
      <Modal
        isOpen={isOpen}
        content={
          <Prose>
            <h1>No USB Drive Detected</h1>
            <p>
              <USBImage src="usb-drive.svg" alt="Insert USB Image" />
              Please insert a USB drive in order to import CVR files from the
              scanner.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <LinkButton onPress={onClose}>Cancel</LinkButton>
            {!window.kiosk && (
              <FileInputButton
                multiple
                onChange={processCastVoteRecordFilesFromFilePicker}
                data-testid="manual-input"
              >
                Select Files…
              </FileInputButton>
            )}{' '}
          </React.Fragment>
        }
      />
    )
  }

  if (usbDriveStatus === UsbDriveStatus.mounted) {
    // Parse information from the filenames and sort by exported timestamp
    const parsedFileInformation = foundFiles
      .map((f) => {
        return {
          parsedInfo: parseCVRFileInfoFromFilename(f.name),
          fileEntry: f,
        }
      })
      .filter((f) => !!f.parsedInfo)
      .sort(
        (a, b) =>
          b.parsedInfo!.timestamp.getTime() - a.parsedInfo!.timestamp.getTime()
      )

    // Parse the file options on the USB drive and build table rows for each valid file.
    const testFileTableRows = []
    const testFileEntries = []
    const liveFileTableRows = []
    const liveFileEntries = []
    for (const { parsedInfo, fileEntry } of parsedFileInformation) {
      const {
        isTestModeResults,
        machineId,
        numberOfBallots,
        timestamp,
      } = parsedInfo!
      const isImported = castVoteRecordFiles.filenameAlreadyImported(
        fileEntry.name
      )
      const row = (
        <tr key={fileEntry.name} data-testid="table-row">
          <td>{moment(timestamp).format('MM/DD/YYYY hh:mm:ss A')}</td>
          <td>{machineId}</td>
          <td>{numberOfBallots}</td>
          <CheckTD narrow textAlign="center">
            {isImported ? GLOBALS.CHECK_ICON : ''}
          </CheckTD>
        </tr>
      )
      if (isTestModeResults) {
        testFileTableRows.push(row)
        !isImported && testFileEntries.push(fileEntry)
      } else {
        liveFileTableRows.push(row)
        !isImported && liveFileEntries.push(fileEntry)
      }
    }

    // Determine if we are already locked to a filemode based on previously imported CVRs
    let fileMode = castVoteRecordFiles?.fileMode
    const fileModeLocked = !!fileMode

    // Even if there are no previously imported CVRs set the filemode if we only see files of one type
    if (
      !fileModeLocked &&
      (liveFileTableRows.length > 0 || testFileTableRows.length > 0)
    ) {
      if (liveFileTableRows.length === 0) {
        // We already know both array are not empty
        fileMode = 'test'
      } else if (testFileTableRows.length === 0) {
        fileMode = 'live'
      }
    }

    // Which table of files (test or live) should we actually show
    const showingTestFileTable = fileMode === 'test' || isToggledToTestMode
    const fileEntries = showingTestFileTable ? testFileEntries : liveFileEntries
    const numberOfNewFiles = fileEntries.length
    const tableRows = showingTestFileTable
      ? testFileTableRows
      : liveFileTableRows

    // Set the header and instructional text for the modal
    const headerModeText =
      fileMode === 'test' ? 'Test Mode' : fileMode === 'live' ? 'Live Mode' : ''

    let instructionalText = null
    if (numberOfNewFiles === 0) {
      instructionalText =
        'There were no new CVR files automatically found on this USB drive. Export CVR files to this USB drive from the scanner. Optionally, you may manually select files to import.'
    } else if (fileModeLocked && fileMode === 'live') {
      instructionalText =
        'The following live mode CVR files were automatically found on this USB drive. Since live mode CVR files have been previously imported to Election Manager you must remove those files in order to import test mode CVR files. If you do not see the files you are looking for, you may manually select files to import.'
    } else if (fileModeLocked && fileMode === 'test') {
      instructionalText =
        'The following test mode CVR files were automatically found on this USB drive. Since test mode CVR files have been previously imported to Election Manager you must remove those files in order to import live mode CVR files. If you do not see the files you are looking for, you may manually select files to import.'
    } else if (fileMode === 'live') {
      instructionalText =
        'The following live mode CVR files were automatically found on this USB drive. No test mode CVRs were found. If you do not see the files you are looking for, you may manually select files to import.'
    } else if (fileMode === 'test') {
      instructionalText =
        'The following test mode CVR files were automatically found on this USB drive. No live mode CVRs were found. If you do not see the files you are looking for, you may manually select files to import.'
    } else {
      instructionalText =
        'This USB drive contains both test mode and live mode CVR files. Select which type you would like to import to see the list of files and import. If you do not see the files you are looking for, you may manually select files to import.'
    }

    return (
      <Modal
        isOpen={isOpen}
        className="import-cvr-modal"
        content={
          <MainChild>
            <Prose>
              <Header>
                Import {headerModeText} CVR Files{' '}
                {!fileMode && numberOfNewFiles > 0 && (
                  <SegmentedButton>
                    <Button
                      onPress={() => setIsToggledToTestMode(true)}
                      disabled={isToggledToTestMode}
                      small
                    >
                      Test Ballots
                    </Button>
                    <Button
                      onPress={() => setIsToggledToTestMode(false)}
                      disabled={!isToggledToTestMode}
                      small
                    >
                      Live Ballots
                    </Button>
                  </SegmentedButton>
                )}
              </Header>
              <p>{instructionalText}</p>
            </Prose>
            {tableRows.length > 0 && (
              <CVRFileTable>
                <thead>
                  <tr>
                    <th>Exported At</th>
                    <th>Scanner ID</th>
                    <th>CVR Count</th>
                    <th>Previously Imported?</th>
                  </tr>
                </thead>
                <tbody>{tableRows}</tbody>
              </CVRFileTable>
            )}
          </MainChild>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <LinkButton onPress={onClose}>Cancel</LinkButton>
            <FileInputButton
              multiple
              onChange={processCastVoteRecordFilesFromFilePicker}
              data-testid="manual-input"
            >
              Select Files Manually…
            </FileInputButton>
            {numberOfNewFiles > 0 && (
              <LinkButton
                onPress={() => importSelectedFiles(fileEntries)}
                primary
              >
                Import {numberOfNewFiles} New File
                {numberOfNewFiles > 1 ? 's' : ''}
              </LinkButton>
            )}
          </React.Fragment>
        }
      />
    )
  }
  // Creates a compile time check to make sure this switch statement includes all enum values for UsbDriveStatus
  throwBadStatus(usbDriveStatus)
}

export default ImportCVRFilesModal
