import React, { useContext, useEffect, useState } from 'react'
import styled from 'styled-components'
import path from 'path'
import fileDownload from 'js-file-download'

import AppContext from '../contexts/AppContext'
import Modal from './Modal'
import Button, { SegmentedButton } from './Button'
import Prose from './Prose'
import LinkButton from './LinkButton'
import Loading from './Loading'
import { MainChild } from './Main'
import USBControllerButton from './USBControllerButton'
import ConverterClient from '../lib/ConverterClient'
import { UsbDriveStatus, getDevicePath } from '../lib/usbstick'
import { generateFinalExportDefaultFilename } from '../utils/filenames'
import throwIllegalValue from '../utils/throwIllegalValue'

const USBImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`

export interface Props {
  isOpen: boolean
  onClose: () => void
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

const ExportFinalResultsModal: React.FC<Props> = ({
  isOpen,
  onClose: onCloseFromProps,
}) => {
  const {
    usbDriveStatus,
    castVoteRecordFiles,
    electionDefinition,
    fullElectionExternalTally,
  } = useContext(AppContext)

  const [currentState, setCurrentState] = useState(ModalState.INIT)
  const [errorMessage, setErrorMessage] = useState('')

  const [savedFilename, setSavedFilename] = useState('')
  const [includeExternalFile, setIncludeExternalFile] = useState(true)
  const [defaultFilename, setDefaultFilename] = useState('')

  const isTestMode = castVoteRecordFiles?.fileMode === 'test'

  /*
   * We use useEffect here since this Modal is rendered even when the Modal
   * is closed, i.e. when isOpen is false. We want to "reset" the filename whenever
   * the modal opens again but not on every render of the dialog.
   */
  useEffect(() => {
    setDefaultFilename(
      generateFinalExportDefaultFilename(
        isTestMode,
        electionDefinition!.election
      )
    )
  }, [isOpen])

  const onClose = () => {
    setErrorMessage('')
    setCurrentState(ModalState.INIT)
    setSavedFilename('')
    setDefaultFilename('')
    onCloseFromProps()
  }

  const exportResults = async (
    openFileDialog: boolean,
    defaultFilename: string
  ) => {
    setCurrentState(ModalState.SAVING)
    const includeExternalData = fullElectionExternalTally && includeExternalFile

    try {
      const CastVoteRecordsString = castVoteRecordFiles.castVoteRecords
        .flat(1)
        .map((c) => JSON.stringify(c))
        .join('\n')

      // process on the server
      const client = new ConverterClient('results')
      const { inputFiles, outputFiles } = await client.getFiles()
      const [electionDefinitionFile, cvrFile] = inputFiles
      const resultsFile = outputFiles[0]

      await client.setInputFile(
        electionDefinitionFile.name,
        new File(
          [electionDefinition!.electionData],
          electionDefinitionFile.name,
          {
            type: 'application/json',
          }
        )
      )
      await client.setInputFile(
        cvrFile.name,
        new File([CastVoteRecordsString], 'cvrs')
      )
      await client.process()

      // download the result
      let results = await client.getOutputFile(resultsFile.name)

      // If we are combinining with external file, do the combination now
      if (includeExternalData) {
        await client.reset()
        const fileFromResults = new File([results], 'temp-name.csv')
        results = await client.combineResultsFiles(
          fileFromResults,
          fullElectionExternalTally!.file
        )
      }

      if (!window.kiosk) {
        fileDownload(results, defaultFilename, 'text/csv')
      } else {
        const usbPath = await getDevicePath()
        const pathToFile = path.join(usbPath!, defaultFilename)
        if (openFileDialog) {
          const fileWriter = await window.kiosk.saveAs({
            defaultPath: pathToFile,
          })

          if (!fileWriter) {
            throw new Error('could not begin download; no file was chosen')
          }

          await fileWriter.write(await results.text())
          setSavedFilename(fileWriter.filename)
          await fileWriter.end()
        } else {
          await window.kiosk!.writeFile(pathToFile, await results.text())
          setSavedFilename(defaultFilename)
        }
      }

      // reset server files
      await client.reset()
      await new Promise((resolve) => setTimeout(resolve, 2000))
      setCurrentState(ModalState.DONE)
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
            <h1>Saving Results Failed</h1>
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
        <LinkButton onPress={onClose}>Close</LinkButton>
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
            <h1>Results File Saved</h1>
            <p>You may now eject the USB drive.</p>
            <p>
              Results file successfully saved{' '}
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
    return (
      <Modal
        isOpen={isOpen}
        content={<Loading>Saving Results File</Loading>}
        onOverlayClick={onClose}
      />
    )
  }

  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState) // Creates a compile time check that all states are being handled.
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
                <USBImage src="usb-drive.svg" alt="Insert USB Image" />
                Please insert a USB drive where the election results will be
                saved.
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
    case UsbDriveStatus.mounted: {
      let options = null
      if (fullElectionExternalTally) {
        options = (
          <p>
            Include data from SEMS file:{' '}
            <SegmentedButton>
              <Button
                small
                disabled={includeExternalFile}
                onPress={() => setIncludeExternalFile(true)}
              >
                Yes
              </Button>
              <Button
                small
                disabled={!includeExternalFile}
                onPress={() => setIncludeExternalFile(false)}
              >
                No
              </Button>
            </SegmentedButton>
          </p>
        )
      }
      return (
        <Modal
          isOpen={isOpen}
          content={
            <MainChild>
              <Prose>
                <h1>Save Results File</h1>
                {options}
                <p>
                  Save the final tally results to{' '}
                  <strong>{defaultFilename}</strong> directly on the inserted
                  USB drive?
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

export default ExportFinalResultsModal
