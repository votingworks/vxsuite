import React, { useContext, useEffect, useState } from 'react'
import styled from 'styled-components'
import path from 'path'
import moment from 'moment'

import AppContext from '../contexts/AppContext'
import Modal from './Modal'
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

const LabelText = styled.span`
  vertical-align: middle;
  text-transform: uppercase;
  font-size: 0.7rem;
  font-weight: 500;
`

enum ModalState {
  ERROR = 'error',
  DUPLICATE = 'duplicate',
  LOADING = 'loading',
  INIT = 'init',
}

export interface Props {
  isOpen: boolean
  onClose: () => void
}

function throwBadStatus(s: never): never {
  throw new Error(`Bad status: ${s}`)
}

const ImportCVRFilesModal: React.FC<Props> = ({
  isOpen,
  onClose: onCloseFromProps,
}) => {
  const {
    usbDriveStatus,
    saveCastVoteRecordFiles,
    castVoteRecordFiles,
    electionDefinition,
  } = useContext(AppContext)
  const [currentState, setCurrentState] = useState(ModalState.INIT)
  const [foundFiles, setFoundFiles] = useState<KioskBrowser.FileSystemEntry[]>(
    []
  )
  const { election, electionHash } = electionDefinition!

  const onClose = () => {
    setCurrentState(ModalState.INIT)
    onCloseFromProps()
  }

  const importSelectedFile = async (
    fileEntry: KioskBrowser.FileSystemEntry
  ) => {
    setCurrentState(ModalState.LOADING)
    const newCastVoteRecordFiles = await castVoteRecordFiles.addAllFromFileSystemEntries(
      [fileEntry],
      election
    )
    saveCastVoteRecordFiles(newCastVoteRecordFiles)

    if (newCastVoteRecordFiles.duplicateFiles.includes(fileEntry.name)) {
      setCurrentState(ModalState.DUPLICATE)
    } else if (newCastVoteRecordFiles.lastError?.filename === fileEntry.name) {
      setCurrentState(ModalState.ERROR)
    } else {
      onClose()
    }
  }

  const processCastVoteRecordFileFromFilePicker: InputEventFunction = async (
    event
  ) => {
    const input = event.currentTarget
    const files = Array.from(input.files || [])
    setCurrentState(ModalState.LOADING)

    if (files.length === 1) {
      const newCastVoteRecordFiles = await castVoteRecordFiles.addAll(
        files,
        election
      )
      saveCastVoteRecordFiles(newCastVoteRecordFiles)

      input.value = ''

      if (newCastVoteRecordFiles.duplicateFiles.includes(files[0].name)) {
        setCurrentState(ModalState.DUPLICATE)
      } else if (newCastVoteRecordFiles.lastError?.filename === files[0].name) {
        setCurrentState(ModalState.ERROR)
      } else {
        onClose()
      }
    } else {
      onClose()
    }
  }

  const fetchFilenames = async () => {
    setCurrentState(ModalState.LOADING)
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
      setCurrentState(ModalState.INIT)
    } catch (err) {
      if (err.message.includes('ENOENT')) {
        // No files found
        setFoundFiles([])
        setCurrentState(ModalState.INIT)
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

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        isOpen={isOpen}
        content={
          <Prose>
            <h1>Error</h1>
            <p>
              There was an error reading the content of the file{' '}
              <strong>{castVoteRecordFiles?.lastError?.filename}</strong>:{' '}
              {castVoteRecordFiles?.lastError?.message}. Please ensure this file
              only contains valid CVR data for this election.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <LinkButton onPress={onClose}>Close</LinkButton>
          </React.Fragment>
        }
      />
    )
  }

  if (currentState === ModalState.DUPLICATE) {
    return (
      <Modal
        isOpen={isOpen}
        content={
          <Prose>
            <h1>Duplicate File</h1>
            <p>
              The selected file was ignored as a duplicate of a previously
              imported file.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <LinkButton onPress={onClose}>Close</LinkButton>
          </React.Fragment>
        }
      />
    )
  }

  if (
    currentState === ModalState.LOADING ||
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
                onChange={processCastVoteRecordFileFromFilePicker}
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
      .flatMap((fileEntry) => {
        const parsedInfo = parseCVRFileInfoFromFilename(fileEntry.name)

        if (!parsedInfo) {
          return []
        }

        return [
          {
            parsedInfo,
            fileEntry,
          },
        ]
      })
      .sort(
        (a, b) =>
          b.parsedInfo!.timestamp.getTime() - a.parsedInfo!.timestamp.getTime()
      )

    // Determine if we are already locked to a filemode based on previously imported CVRs
    const fileMode = castVoteRecordFiles?.fileMode
    const fileModeLocked = !!fileMode

    // Parse the file options on the USB drive and build table rows for each valid file.
    const fileTableRows = []
    let numberOfNewFiles = 0
    for (const { parsedInfo, fileEntry } of parsedFileInformation) {
      const {
        isTestModeResults,
        machineId,
        numberOfBallots,
        timestamp,
      } = parsedInfo
      const isImported = castVoteRecordFiles.filenameAlreadyImported(
        fileEntry.name
      )
      const inProperFileMode =
        !fileModeLocked ||
        (isTestModeResults && fileMode === 'test') ||
        (!isTestModeResults && fileMode === 'live')
      const canImport = !isImported && inProperFileMode
      const row = (
        <tr key={fileEntry.name} data-testid="table-row">
          <td>{moment(timestamp).format('MM/DD/YYYY hh:mm:ss A')}</td>
          <td>{machineId}</td>
          <td>{numberOfBallots}</td>
          <td>
            <LabelText>{isTestModeResults ? 'Test' : 'Live'}</LabelText>
          </td>
          <CheckTD narrow textAlign="center">
            {isImported ? GLOBALS.CHECK_ICON : ''}
          </CheckTD>
          <TD textAlign="right">
            <LinkButton
              onPress={() => importSelectedFile(fileEntry)}
              disabled={!canImport}
              small
              primary
            >
              Select
            </LinkButton>
          </TD>
        </tr>
      )
      if (inProperFileMode) {
        fileTableRows.push(row)
        if (canImport) {
          numberOfNewFiles += 1
        }
      }
    }
    // Set the header and instructional text for the modal
    const headerModeText =
      fileMode === 'test' ? 'Test Mode' : fileMode === 'live' ? 'Live Mode' : ''

    let instructionalText: string
    if (numberOfNewFiles === 0) {
      instructionalText =
        'There were no new CVR files automatically found on this USB drive. Export CVR files to this USB drive from the scanner. Optionally, you may manually select files to import.'
    } else if (fileModeLocked) {
      instructionalText = `The following ${fileMode} mode CVR files were automatically found on this USB drive. Select which file to import or if you do not see the file you are looking for, you may manually select a file to import.`
    } else {
      instructionalText =
        'The following CVR files were automatically found on this USB drive. Select which file to import or if you do not see the file you are looking for, you may manually select a file to import.'
    }

    return (
      <Modal
        isOpen={isOpen}
        className="import-cvr-modal"
        content={
          <MainChild>
            <Prose>
              <Header>Import {headerModeText} CVR Files </Header>
              <p>{instructionalText}</p>
            </Prose>
            {fileTableRows.length > 0 && (
              <CVRFileTable>
                <thead>
                  <tr>
                    <th>Exported At</th>
                    <th>Scanner ID</th>
                    <th>CVR Count</th>
                    <th>Ballot Type</th>
                    <th>Previously Imported?</th>
                    <th />
                  </tr>
                </thead>
                <tbody>{fileTableRows}</tbody>
              </CVRFileTable>
            )}
          </MainChild>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <LinkButton onPress={onClose}>Cancel</LinkButton>
            <FileInputButton
              onChange={processCastVoteRecordFileFromFilePicker}
              data-testid="manual-input"
            >
              Select File Manually…
            </FileInputButton>
          </React.Fragment>
        }
      />
    )
  }
  // Creates a compile time check to make sure this switch statement includes all enum values for UsbDriveStatus
  throwBadStatus(usbDriveStatus)
}

export default ImportCVRFilesModal
