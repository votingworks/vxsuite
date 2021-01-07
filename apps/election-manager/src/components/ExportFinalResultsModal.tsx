import React, { useContext, useState, useEffect } from 'react'
import styled from 'styled-components'

import AppContext from '../contexts/AppContext'
import Modal from './Modal'
import Button from './Button'
import Prose from './Prose'
import LinkButton from './LinkButton'
import Loading from './Loading'
import TextInput from './TextInput'
import Text from './Text'
import { MainChild } from './Main'
import USBControllerButton from './USBControllerButton'
import { UsbDriveStatus } from '../lib/usbstick'

function throwBadStatus(s: never): never {
  throw new Error(`Bad status: ${s}`)
}

const USBImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`

const TextInputRow = styled.span`
  display: flex;
  align-items: center;
  margin-top: 0;
  & > *:not(:first-child) {
    margin-left: 5px;
  }
`

const FilenameInput = styled(TextInput)`
  text-align: right;
`

const LabelText = styled(Text)`
  margin-bottom: 0;
  font-weight: 700;
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
  const { usbDriveStatus } = useContext(AppContext)

  const [currentState, setCurrentState] = useState<ModalState>(ModalState.INIT)
  const [errorMessage, setErrorMessage] = useState('')

  const [filename, setFilename] = useState('')

  useEffect(() => {
    if (filename === '' && usbDriveStatus === UsbDriveStatus.mounted) {
      setFilename('this-is-the-default-filename')
    }
  }, [usbDriveStatus, isOpen])

  const onClose = () => {
    setErrorMessage('')
    setCurrentState(ModalState.INIT)
    setFilename('')
    onCloseFromProps()
  }

  const exportResults = async () => {
    setCurrentState(ModalState.SAVING)
  }

  const handleFilenameInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    let newValue = event.currentTarget.value
    newValue = newValue.replace(/[^A-Za-z-]/gi, '')
    setFilename(newValue)
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
                <USBImage src="usb-drive.svg" alt="Insert USB Image" />
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
                  onPress={() => exportResults()}
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
            <MainChild>
              <Prose>
                <h1>Export Results</h1>
                <p>
                  Export the final tally results to the following filename on
                  the inserted USB drive.
                </p>
              </Prose>
              <LabelText small>Filename</LabelText>
              <TextInputRow>
                <FilenameInput
                  value={filename}
                  onChange={handleFilenameInputChange}
                />
                <span>.csv</span>
              </TextInputRow>
            </MainChild>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
              <Button primary onPress={() => exportResults()}>
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

export default ExportFinalResultsModal
