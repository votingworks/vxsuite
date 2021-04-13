import React, { useContext, useState } from 'react'
import styled from 'styled-components'
import path from 'path'
import fileDownload from 'js-file-download'

import AppContext from '../contexts/AppContext'
import Modal from './Modal'
import Button from './Button'
import Prose from './Prose'
import LinkButton from './LinkButton'
import Loading from './Loading'
import { MainChild } from './Main'
import { UsbDriveStatus, getDevicePath } from '../lib/usbstick'
import throwIllegalValue from '../utils/throwIllegalValue'
import USBControllerButton from './USBControllerButton'

const USBImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`

export enum FileType {
  TallyReport = 'TallyReport',
  TestDeckTallyReport = 'TestDeckTallyReport',
  Ballot = 'Ballot',
  Results = 'Results',
}

export interface Props {
  onClose: () => void
  generateFileContent: () => Promise<Uint8Array | string>
  defaultFilename: string
  fileType: FileType
  promptToEjectUSB?: boolean
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

const SaveFileToUSB: React.FC<Props> = ({
  onClose,
  generateFileContent,
  defaultFilename,
  fileType,
  promptToEjectUSB = false,
}) => {
  const { usbDriveStatus, isOfficialResults } = useContext(AppContext)

  const [currentState, setCurrentState] = useState(ModalState.INIT)
  const [errorMessage, setErrorMessage] = useState('')

  const [savedFilename, setSavedFilename] = useState('')

  const exportResults = async (
    openFileDialog: boolean,
    defaultFilename: string
  ) => {
    setCurrentState(ModalState.SAVING)

    try {
      const results = await generateFileContent()
      if (!window.kiosk) {
        fileDownload(results, defaultFilename, 'text/csv')
      } else {
        const usbPath = await getDevicePath()
        const pathToFile =
          !usbPath && process.env.NODE_ENV === 'development'
            ? defaultFilename
            : path.join(usbPath!, defaultFilename)
        if (openFileDialog) {
          const fileWriter = await window.kiosk.saveAs({
            defaultPath: pathToFile,
          })

          if (!fileWriter) {
            throw new Error('could not begin download; no file was chosen')
          }

          await fileWriter.write(results)
          setSavedFilename(fileWriter.filename)
          await fileWriter.end()
        } else {
          await window.kiosk!.writeFile(pathToFile, results)
          setSavedFilename(defaultFilename)
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000))
      setCurrentState(ModalState.DONE)
    } catch (error) {
      setErrorMessage(error.message)
      setCurrentState(ModalState.ERROR)
    }
  }

  let title = '' // Will be used in headings like Save Title
  let fileName = '' // Will be used in sentence like "Would you like to save the title?"
  switch (fileType) {
    case FileType.TallyReport:
      title = `${isOfficialResults ? 'Official' : 'Unofficial'} Tally Report`
      fileName = 'tally report'
      break
    case FileType.TestDeckTallyReport:
      title = 'Test Deck Tally Report'
      fileName = 'test deck tally report'
      break
    case FileType.Ballot:
      title = 'Ballot'
      fileName = 'ballot'
      break
    case FileType.Results:
      title = 'Results'
      fileName = 'election results'
      break
    default:
      throwIllegalValue(fileType)
  }

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        content={
          <Prose>
            <h1>Failed to Save {title}</h1>
            <p>
              Failed to save {fileName}. {errorMessage}
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    )
  }

  if (currentState === ModalState.DONE) {
    let actions = <LinkButton onPress={onClose}>Close</LinkButton>
    if (promptToEjectUSB && usbDriveStatus !== UsbDriveStatus.recentlyEjected) {
      actions = (
        <React.Fragment>
          <LinkButton onPress={onClose}>Close</LinkButton>
          <USBControllerButton small={false} primary />
        </React.Fragment>
      )
    }
    return (
      <Modal
        content={
          <Prose>
            <h1>{title} Saved</h1>
            {promptToEjectUSB && <p>You may now eject the USB drive.</p>}
            <p>
              {fileName.charAt(0).toUpperCase() + fileName.slice(1)}{' '}
              successfully saved{' '}
              {savedFilename !== '' && (
                <span>
                  as <strong>{savedFilename}</strong>
                </span>
              )}{' '}
              directly on the inserted USB drive.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={actions}
      />
    )
  }

  if (currentState === ModalState.SAVING) {
    return <Modal content={<Loading>Saving {title}</Loading>} />
  }

  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState)
  }

  switch (usbDriveStatus) {
    case UsbDriveStatus.absent:
    case UsbDriveStatus.notavailable:
    case UsbDriveStatus.recentlyEjected:
      // When run not through kiosk mode let the user download the file
      // on the machine for internal debugging use
      return (
        <Modal
          content={
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <USBImage src="/usb-drive.svg" alt="Insert USB Image" />
                Please insert a USB drive where you would like the save the{' '}
                {fileName}.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
              {(!window.kiosk || process.env.NODE_ENV === 'development') && (
                <Button
                  data-testid="manual-export"
                  onPress={() => exportResults(true, defaultFilename)}
                >
                  Save
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
          content={<Loading />}
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
            </React.Fragment>
          }
        />
      )
    case UsbDriveStatus.mounted: {
      return (
        <Modal
          content={
            <MainChild>
              <Prose>
                <h1>Save {title}</h1>
                <p>
                  Save the {fileName} as <strong>{defaultFilename}</strong>{' '}
                  directly on the inserted USB drive?
                </p>
              </Prose>
            </MainChild>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
              <Button onPress={() => exportResults(true, defaultFilename)}>
                Save As…
              </Button>
              <Button
                primary
                onPress={() => exportResults(false, defaultFilename)}
              >
                Save
              </Button>
            </React.Fragment>
          }
        />
      )
    }
    default:
      // Creates a compile time check to make sure this switch statement includes all enum values for UsbDriveStatus
      throwIllegalValue(usbDriveStatus)
  }
}

export default SaveFileToUSB
