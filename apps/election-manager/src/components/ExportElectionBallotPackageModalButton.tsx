import React, { useCallback, useContext, useEffect, useState } from 'react'
import pluralize from 'pluralize'
import styled from 'styled-components'
import path from 'path'
import { getElectionLocales } from '@votingworks/types'

import { DEFAULT_LOCALE } from '../config/globals'
import {
  getBallotPath,
  getPrecinctById,
  getHumanBallotLanguageFormat,
} from '../utils/election'

import AppContext from '../contexts/AppContext'
import HandMarkedPaperBallot from './HandMarkedPaperBallot'
import Modal from './Modal'
import Button from './Button'
import Prose from './Prose'
import LinkButton from './LinkButton'
import Loading from './Loading'
import { Monospace } from './Text'
import { getDevicePath, UsbDriveStatus } from '../lib/usbstick'
import USBControllerButton from './USBControllerButton'

import * as workflow from '../workflows/ExportElectionBallotPackageWorkflow'
import {
  generateFilenameForBallotExportPackage,
  BALLOT_PACKAGES_FOLDER,
} from '../utils/filenames'

const USBImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`

const ExportElectionBallotPackageModalButton: React.FC = () => {
  const { electionDefinition, usbDriveStatus } = useContext(AppContext)
  const { election, electionData, electionHash } = electionDefinition!
  const electionLocaleCodes = getElectionLocales(election, DEFAULT_LOCALE)

  const [state, setState] = useState<workflow.State>(
    workflow.init(election, electionHash, electionLocaleCodes)
  )

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  /**
   * Execute side effects for the current state and, when ready, transition to
   * the next state.
   */
  useEffect(() => {
    ;(async () => {
      switch (state.type) {
        case 'Init': {
          setState(workflow.next)
          break
        }

        case 'ArchiveEnd': {
          await state.archive.end()
          setState(workflow.next)
        }
      }
    })()
  }, [state, election, electionData, electionHash])

  /**
   * Callback from `HandMarkedPaperBallot` to let us know the preview has been
   * rendered. Once this happens, we generate a PDF and move on to the next one
   * or finish up if that was the last one.
   */
  const onRendered = useCallback(async () => {
    if (state.type !== 'RenderBallot') {
      throw new Error(
        `unexpected state '${state.type}' found during onRendered callback`
      )
    }

    const {
      ballotStyleId,
      precinctId,
      locales,
      isLiveMode,
    } = state.currentBallotConfig
    const path = getBallotPath({
      ballotStyleId,
      election,
      electionHash,
      precinctId,
      locales,
      isLiveMode,
    })
    const data = await window.kiosk!.printToPDF()
    await state.archive.file(path, Buffer.from(data))
    setState(workflow.next)
  }, [election, electionHash, state])

  const closeModal = () => {
    setIsModalOpen(false)
    setState(workflow.init(election, electionHash, electionLocaleCodes))
  }

  const now = new Date()
  const defaultFileName = generateFilenameForBallotExportPackage(
    electionDefinition!,
    now
  )

  // Callback to open the file dialog.
  const saveFileCallback = async (openDialog: boolean) => {
    if (state.type !== 'ArchiveBegin') {
      throw new Error(
        `unexpected state '${state.type}' found during saveFileCallback`
      )
    }
    try {
      const usbPath = await getDevicePath()
      const pathToFolder = usbPath && path.join(usbPath, BALLOT_PACKAGES_FOLDER)
      const pathToFile = path.join(pathToFolder ?? '.', defaultFileName)
      if (openDialog || !pathToFolder) {
        await state.archive.beginWithDialog({
          defaultPath: pathToFile,
          filters: [{ name: 'Archive Files', extensions: ['zip'] }],
        })
      } else {
        await state.archive.beginWithDirectSave(pathToFolder, defaultFileName)
      }
      await state.archive.file('election.json', electionData)
      await state.archive.file(
        'manifest.json',
        JSON.stringify({ ballots: state.ballotConfigs }, undefined, 2)
      )
      setState(workflow.next)
    } catch (error) {
      setState(workflow.error(state, error))
    }
  }

  let mainContent = null
  let actions = null

  switch (state.type) {
    case 'Init': {
      mainContent = <Loading />
      actions = (
        <LinkButton onPress={closeModal} disabled>
          Cancel
        </LinkButton>
      )
      break
    }

    case 'ArchiveBegin':
      switch (usbDriveStatus) {
        case UsbDriveStatus.absent:
        case UsbDriveStatus.notavailable:
        case UsbDriveStatus.recentlyEjected:
          actions = <LinkButton onPress={closeModal}>Cancel</LinkButton>
          mainContent = (
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <USBImage
                  src="usb-drive.svg"
                  alt="Insert USB Image"
                  // hidden feature to export with file dialog by double-clicking
                  onDoubleClick={() => saveFileCallback(true)}
                />
                Please insert a USB drive in order to export the ballot
                configuration.
              </p>
            </Prose>
          )
          break
        case UsbDriveStatus.ejecting:
        case UsbDriveStatus.present:
          mainContent = <Loading />
          actions = (
            <LinkButton onPress={closeModal} disabled>
              Cancel
            </LinkButton>
          )
          break
        case UsbDriveStatus.mounted: {
          actions = (
            <React.Fragment>
              <LinkButton onPress={closeModal}>Cancel</LinkButton>
              <Button onPress={() => saveFileCallback(true)}>Custom</Button>
              <Button onPress={() => saveFileCallback(false)} primary>
                Export
              </Button>
            </React.Fragment>
          )
          mainContent = (
            <Prose>
              <h1>Export Ballot Package</h1>
              <p>
                <USBImage src="usb-drive.svg" alt="Insert USB Image" />A zip
                archive will automatically be saved to the default location on
                the mounted USB drive. Optionally, you may pick a custom export
                location.
              </p>
            </Prose>
          )
          break
        }
      }
      break

    case 'RenderBallot': {
      actions = (
        <LinkButton onPress={closeModal} disabled>
          Cancel
        </LinkButton>
      )
      const {
        ballotStyleId,
        precinctId,
        contestIds,
        isLiveMode,
        locales,
      } = state.currentBallotConfig
      const precinctName = getPrecinctById({ election, precinctId })!.name

      mainContent = (
        <Prose>
          <h1>
            Generating Ballot{' '}
            {state.ballotConfigsCount - state.remainingBallotConfigs.length} of{' '}
            {state.ballotConfigsCount}…
          </h1>
          <ul>
            <li>
              Ballot Style: <strong>{ballotStyleId}</strong>
            </li>
            <li>
              Precinct: <strong>{precinctName}</strong>
            </li>
            <li>
              Contest count: <strong>{contestIds.length}</strong>
            </li>
            <li>
              Language format:{' '}
              <strong>{getHumanBallotLanguageFormat(locales)}</strong>
            </li>
            <li>
              Filename:{' '}
              <Monospace>{state.currentBallotConfig.filename}</Monospace>
            </li>
          </ul>
          <HandMarkedPaperBallot
            ballotStyleId={ballotStyleId}
            election={election}
            electionHash={electionHash}
            isLiveMode={isLiveMode}
            precinctId={precinctId}
            onRendered={onRendered}
            locales={locales}
          />
        </Prose>
      )
      break
    }

    case 'ArchiveEnd': {
      actions = (
        <LinkButton onPress={closeModal} disabled>
          Cancel
        </LinkButton>
      )
      mainContent = (
        <Prose>
          <h1>Finishing Download…</h1>
          <p>
            Rendered {pluralize('ballot', state.ballotConfigsCount, true)},
            closing zip file.
          </p>
        </Prose>
      )
      break
    }

    case 'Done': {
      if (usbDriveStatus !== UsbDriveStatus.recentlyEjected) {
        actions = (
          <React.Fragment>
            <LinkButton onPress={closeModal}>Cancel</LinkButton>
            <USBControllerButton primary small={false} />
          </React.Fragment>
        )
      } else {
        actions = <LinkButton onPress={closeModal}>Close</LinkButton>
      }
      mainContent = (
        <Prose>
          <h1>Download Complete</h1>
          <p>
            You may now eject the USB drive. Use the exported ballot package on
            this USB drive to configure the Ballot Scanner.
          </p>
        </Prose>
      )
      break
    }

    case 'Failed': {
      actions = <LinkButton onPress={closeModal}>Close</LinkButton>
      mainContent = (
        <Prose>
          <h1>Download Failed</h1>
          <p>An error occurred: {state.message}.</p>
        </Prose>
      )
      break
    }
  }

  return (
    <React.Fragment>
      <LinkButton small onPress={() => setIsModalOpen(true)}>
        Export Ballot Package
      </LinkButton>
      {isModalOpen && (
        <Modal
          content={mainContent}
          onOverlayClick={closeModal}
          actions={actions}
        />
      )}
    </React.Fragment>
  )
}

export default ExportElectionBallotPackageModalButton
