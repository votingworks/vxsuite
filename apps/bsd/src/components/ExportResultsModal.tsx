import React, { useContext, useState } from 'react'
import styled from 'styled-components'
import { Election } from '@votingworks/ballot-encoder'
import fileDownload from 'js-file-download'
import path from 'path'

import AppContext from '../contexts/AppContext'
import Modal from './Modal'
import Button from './Button'
import Prose from './Prose'
import LinkButton from './LinkButton'
import Loading from './Loading'
import USBControllerButton from './USBControllerButton'
import { getDevicePath, UsbDriveStatus } from '../lib/usbstick'
import {
  generateElectionBasedSubfolderName,
  generateFilenameForScanningResults,
  SCANNER_RESULTS_FOLDER,
} from '../util/filenames'

function throwBadStatus(s: never): never {
  throw new Error(`Bad status: ${s}`)
}

const USBImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`

export interface Props {
  isOpen: boolean
  onClose: () => void
  usbDriveStatus: UsbDriveStatus
  election: Election
  electionHash: string | undefined
  numberOfBallots: number
  isTestMode: boolean
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

const ExportResultsModal: React.FC<Props> = ({
  isOpen,
  onClose: onCloseFromProps,
  usbDriveStatus,
  election,
  electionHash,
  numberOfBallots,
  isTestMode,
}) => {
  const [currentState, setCurrentState] = useState<ModalState>(ModalState.INIT)
  const [errorMessage, setErrorMessage] = useState('')

  const { machineConfig } = useContext(AppContext)

  const onClose = () => {
    setErrorMessage('')
    setCurrentState(ModalState.INIT)
    onCloseFromProps()
  }

  const exportResults = async (openDialog: boolean) => {
    setCurrentState(ModalState.SAVING)

    try {
      const response = await fetch(`/scan/export`, {
        method: 'post',
      })

      const blob = await response.blob()

      if (response.status !== 200) {
        setErrorMessage(
          `Failed to save results. Error retrieving CVRs from the scanner.`
        )
        setCurrentState(ModalState.ERROR)
        return
      }

      const cvrFilename = generateFilenameForScanningResults(
        machineConfig.machineId,
        numberOfBallots,
        isTestMode,
        new Date()
      )

      if (window.kiosk) {
        const usbPath = await getDevicePath()
        if (!usbPath) {
          throw new Error(
            'could not begin downloand; path to usb drive missing'
          )
        }
        const electionFolderName = generateElectionBasedSubfolderName(
          election,
          electionHash!
        )
        const pathToFolder = path.join(
          usbPath,
          SCANNER_RESULTS_FOLDER,
          electionFolderName
        )
        const pathToFile = path.join(pathToFolder, cvrFilename)
        if (openDialog) {
          const fileWriter = await window.kiosk.saveAs({
            defaultPath: pathToFile,
          })

          if (!fileWriter) {
            throw new Error('could not begin download; no file was chosen')
          }

          await fileWriter.write(await blob.text())
          await fileWriter.end()
        } else {
          await window.kiosk.makeDirectory(pathToFolder, {
            recursive: true,
          })
          await window.kiosk.writeFile(pathToFile, await blob.text())
        }
        setCurrentState(ModalState.DONE)
      } else {
        fileDownload(blob, cvrFilename, 'application/x-jsonlines')
        setCurrentState(ModalState.DONE)
      }
    } catch (error) {
      setErrorMessage(`Failed to save results. ${error.message}`)
      setCurrentState(ModalState.ERROR)
    }
  }

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        isOpen={isOpen}
        content={
          <Prose>
            <h1>Download Failed</h1>
            <p>{errorMessage}</p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    )
  }

  if (currentState === ModalState.DONE) {
    let actions = (
      <React.Fragment>
        <LinkButton onPress={onClose}>Cancel</LinkButton>
        <USBControllerButton small={false} primary />
      </React.Fragment>
    )
    if (usbDriveStatus === UsbDriveStatus.recentlyEjected) {
      actions = <LinkButton onPress={onClose}>Close</LinkButton>
    }
    return (
      <Modal
        isOpen={isOpen}
        content={
          <Prose>
            <h1>Download Complete</h1>
            <p>
              CVR results file saved successfully! You may now eject the USB
              drive and take it to Election Manager for tabulation.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={actions}
      />
    )
  }

  if (currentState === ModalState.SAVING) {
    return (
      <Modal isOpen={isOpen} content={<Loading />} onOverlayClick={onClose} />
    )
  }

  if (currentState !== ModalState.INIT) {
    throwBadStatus(currentState) // Creates a compile time check that all states are being handled.
  }

  switch (usbDriveStatus) {
    case UsbDriveStatus.absent:
    case UsbDriveStatus.notavailable:
    case UsbDriveStatus.recentlyEjected:
      // When run not through kiosk mode let the user download the file
      // on the machine for internal debugging use
      return (
        <Modal
          isOpen={isOpen}
          content={
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <USBImage src="usb-stick.svg" alt="Insert USB Image" />
                Please insert a USB drive in order to export the scanner
                results.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
              {!window.kiosk && (
                <Button
                  data-testid="manual-export"
                  onPress={() => exportResults(true)}
                >
                  Export
                </Button>
              )}{' '}
            </React.Fragment>
          }
        />
      )
    case UsbDriveStatus.ejecting:
    case UsbDriveStatus.present:
      return (
        <Modal
          isOpen={isOpen}
          content={<Loading />}
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
            </React.Fragment>
          }
        />
      )
    case UsbDriveStatus.mounted:
      return (
        <Modal
          isOpen={isOpen}
          content={
            <Prose>
              <h1>Export Results</h1>
              <USBImage src="usb-stick.svg" alt="Insert USB Image" />
              <p>
                A CVR file will automatically be saved to the default location
                on the mounted USB drive. Optionally, you may pick a custom
                export location.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
              <Button onPress={() => exportResults(true)}>Custom</Button>
              <Button primary onPress={() => exportResults(false)}>
                Export
              </Button>
            </React.Fragment>
          }
        />
      )
    default:
      // Creates a compile time check to make sure this switch statement includes all enum values for UsbDriveStatus
      throwBadStatus(usbDriveStatus)
  }
}

export default ExportResultsModal
