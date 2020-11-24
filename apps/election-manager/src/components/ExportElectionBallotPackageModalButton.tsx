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
import LinkButton from './LinkButton'
import Loading from './Loading'
import { Monospace } from './Text'
import { UsbDriveStatus } from '../lib/usbstick'
import USBController from './USBController'

import * as workflow from '../workflows/ExportElectionBallotPackageWorkflow'

const USBImage = styled.img`
  margin-bottom: 20px;
  height: 200px;
`

const PrimaryMessage = styled.h2`
  text-align: center;
`

const Title = styled.h1`
  margin: 0;
  margin-bottom: 20px;
  width: 100%;
  text-align: left;
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
  const defaultFileName = `${`${election.county.name}-${election.title}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/(^-|-$)+/g, '')
    .toLocaleLowerCase()}-${electionHash.slice(
    0,
    10
  )}-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}.zip`

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
      mainContent = <Loading as="h2" />
      break
    }

    case 'ArchiveBegin':
      switch (usbDriveStatus) {
        case UsbDriveStatus.absent:
        case UsbDriveStatus.notavailable:
        case UsbDriveStatus.recentlyEjected:
          mainContent = (
            <React.Fragment>
              <USBImage src="usb-drive.svg" alt="Insert USB Image" />
              <PrimaryMessage> No USB Drive Detected </PrimaryMessage>
              <p>
                Please insert a USB stick in order to export the ballot
                configuration.
              </p>
            </React.Fragment>
          )
          break
        case UsbDriveStatus.ejecting:
        case UsbDriveStatus.present:
          mainContent = <Loading as="h2" />
          break
        case UsbDriveStatus.mounted: {
          // TODO(caro): Update this to just write the file to the USB stick once the APIS in kiosk-browser exist.
          primaryButton = (
            <Button onPress={openFileDialog} primary>
              Export
            </Button>
          )
          mainContent = (
            <React.Fragment>
              <USBImage src="usb-drive.svg" alt="Insert USB Image" />
              <PrimaryMessage> USB Drive Detected! </PrimaryMessage>
              <p>
                Would you like to export the ballot configuration now? A zip
                archive will automatically be saved to the inserted usb drive.
                You may also {/* eslint-disable jsx-a11y/anchor-is-valid */}
                <a href="#" onClick={openFileDialog}>
                  manually select a location to save the archive to.
                </a>
                {/* eslint-enable jsx-a11y/anchor-is-valid */}
              </p>
            </React.Fragment>
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
        <React.Fragment>
          <PrimaryMessage>
            Generating Ballot{' '}
            {state.ballotConfigsCount - state.remainingBallotConfigs.length} of{' '}
            {state.ballotConfigsCount}…
          </PrimaryMessage>
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
        </React.Fragment>
      )
      break
    }

    case 'ArchiveEnd': {
      mainContent = (
        <React.Fragment>
          <p>
            Finishing Download… Rendered{' '}
            {pluralize('ballot', state.ballotConfigsCount, true)}, closing zip
            file.
          </p>
        </React.Fragment>
      )
      break
    }

    case 'Done': {
      primaryButton = <USBController primary small={false} />
      mainContent = (
        <React.Fragment>
          <p>
            Download Complete! Exported{' '}
            {pluralize('ballot', state.ballotConfigsCount, true)}. You may now
            eject the USB device and connect it with your ballot scanning
            machine to configure it.
          </p>
        </React.Fragment>
      )
      break
    }

    case 'Failed': {
      mainContent = (
        <React.Fragment>
          <p>Download Failed! An error occurred: {state.message}.</p>
        </React.Fragment>
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
        content={
          <React.Fragment>
            <Title>Export Ballot Package</Title>
            <React.Fragment>{mainContent}</React.Fragment>
          </React.Fragment>
        }
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
