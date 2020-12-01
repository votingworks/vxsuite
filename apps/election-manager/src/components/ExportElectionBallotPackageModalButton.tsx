import React, { useCallback, useContext, useEffect, useState } from 'react'
import pluralize from 'pluralize'
import styled from 'styled-components'
import { getElectionLocales } from '@votingworks/ballot-encoder'

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
import { UsbDriveStatus } from '../lib/usbstick'
import USBControllerButton from './USBControllerButton'

import * as workflow from '../workflows/ExportElectionBallotPackageWorkflow'
import { generateFilenameForBallotExportPackage } from '../utils/filenames'

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
  const openFileDialog = async () => {
    if (state.type !== 'ArchiveBegin') {
      throw new Error(
        `unexpected state '${state.type}' found during openFileDialog callback`
      )
    }
    try {
      await state.archive.begin({
        defaultPath: defaultFileName,
        filters: [{ name: 'Archive Files', extensions: ['zip'] }],
      })
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
  let primaryButton = null
  let disableCancel = false

  switch (state.type) {
    case 'Init': {
      mainContent = <Loading />
      disableCancel = true
      break
    }

    case 'ArchiveBegin':
      switch (usbDriveStatus) {
        case UsbDriveStatus.absent:
        case UsbDriveStatus.notavailable:
        case UsbDriveStatus.recentlyEjected:
          mainContent = (
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <USBImage src="usb-drive.svg" alt="Insert USB Image" />
                Please insert a USB stick in order to export the ballot
                configuration.
              </p>
            </Prose>
          )
          break
        case UsbDriveStatus.ejecting:
        case UsbDriveStatus.present:
          mainContent = <Loading />
          disableCancel = true
          break
        case UsbDriveStatus.mounted: {
          // TODO(caro): Update this to just write the file to the USB stick once the APIS in kiosk-browser exist.
          primaryButton = (
            <Button onPress={openFileDialog} primary>
              Export
            </Button>
          )
          mainContent = (
            <Prose>
              <h1>USB Drive Detected!</h1>
              <p>
                <USBImage src="usb-drive.svg" alt="Insert USB Image" />
                Would you like to export the ballot configuration now? A zip
                archive will automatically be saved to the inserted USB drive.
                You may also {/* eslint-disable jsx-a11y/anchor-is-valid */}
                <a href="#" onClick={openFileDialog} data-testid="manual-link">
                  manually select a location to save the archive to.
                </a>
                {/* eslint-enable jsx-a11y/anchor-is-valid */}
              </p>
            </Prose>
          )
          break
        }
      }
      break

    case 'RenderBallot': {
      disableCancel = true
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
      primaryButton = <USBControllerButton primary small={false} />
      mainContent = (
        <Prose>
          <h1>Download Complete!</h1>
          <p>
            Exported {pluralize('ballot', state.ballotConfigsCount, true)}. You
            may now eject the USB device and connect it with your ballot
            scanning machine to configure it.
          </p>
        </Prose>
      )
      break
    }

    case 'Failed': {
      mainContent = (
        <Prose>
          <h1>Download Failed!</h1>
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
      <Modal
        isOpen={isModalOpen}
        content={mainContent}
        onOverlayClick={closeModal}
        actions={
          <React.Fragment>
            <LinkButton onPress={closeModal} disabled={disableCancel}>
              Cancel
            </LinkButton>
            {primaryButton}
          </React.Fragment>
        }
      />
    </React.Fragment>
  )
}

export default ExportElectionBallotPackageModalButton
