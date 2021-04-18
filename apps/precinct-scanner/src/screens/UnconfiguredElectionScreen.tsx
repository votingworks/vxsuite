import React, { useState, useEffect } from 'react'
import path from 'path'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'
import { OptionalElectionDefinition, getPrecinctById } from '@votingworks/types'
import { getDevicePath, UsbDriveStatus } from '../utils/usbstick'
import { readBallotPackageFromFilePointer } from '../utils/ballot-package'
import { addTemplates, doneTemplates } from '../api/hmpb'
import {
  PRECINCT_SCANNER_FOLDER,
  BALLOT_PACKAGE_FILENAME,
} from '../config/constants'

interface Props {
  usbDriveStatus: UsbDriveStatus
  setElectionDefinition: (
    electionDefinition: OptionalElectionDefinition
  ) => Promise<void>
}

const UnconfiguredElectionScreen: React.FC<Props> = ({
  usbDriveStatus,
  setElectionDefinition,
}) => {
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoadingBallotPackage, setIsLoadingBallotPackage] = useState(false)

  const [
    currentUploadingBallotIndex,
    setCurrentUploadingBallotIndex,
  ] = useState(-1)
  const [totalTemplates, setTotalTemplates] = useState(0)
  const [currentUploadingBallot, setCurrentUploadingBallot] = useState<{
    ballotStyle: string
    precinct: string
    isLiveMode: boolean
    locales?: string
  }>()
  const [isLoadingTemplates, setLoadingTemplates] = useState(false)

  useEffect(() => {
    const attemptToLoadBallotPackageFromUSB = async () => {
      if (usbDriveStatus !== UsbDriveStatus.mounted) {
        setErrorMessage('')
        setIsLoadingBallotPackage(false)
        setLoadingTemplates(false)
        setTotalTemplates(0)
        return
      }
      setIsLoadingBallotPackage(true)

      try {
        const usbPath = await getDevicePath()
        let files: KioskBrowser.FileSystemEntry[]
        try {
          files = await window.kiosk!.getFileSystemEntries(
            path.join(usbPath!, PRECINCT_SCANNER_FOLDER)
          )
        } catch (error) {
          throw new Error('No ballot package found on the inserted USB drive.')
        }
        const ballotPackages = files.filter(
          (f) => f.type === 1 && f.name === BALLOT_PACKAGE_FILENAME
        )

        // If there is more then one ballot package in the folder, fail.
        if (ballotPackages.length < 1) {
          throw new Error('No ballot package found on the inserted USB drive.')
        }

        const ballotPackage = await readBallotPackageFromFilePointer(
          ballotPackages[0]
        )
        addTemplates(ballotPackage)
          .on('configuring', () => {
            setCurrentUploadingBallotIndex(0)
            setTotalTemplates(ballotPackage.ballots.length)
            setIsLoadingBallotPackage(false)
          })
          .on('uploading', (_pkg, ballot) => {
            const { locales } = ballot.ballotConfig
            setCurrentUploadingBallot({
              ballotStyle: ballot.ballotConfig.ballotStyleId,
              precinct:
                /* istanbul ignore next */
                getPrecinctById({
                  election: ballotPackage.electionDefinition.election,
                  precinctId: ballot.ballotConfig.precinctId,
                })?.name ?? ballot.ballotConfig.precinctId,
              isLiveMode: ballot.ballotConfig.isLiveMode,
              locales: locales?.secondary
                ? `${locales.primary} / ${locales.secondary}`
                : locales?.primary,
            })
            setCurrentUploadingBallotIndex(
              ballotPackage.ballots.indexOf(ballot)
            )
          })
          .on('completed', async () => {
            setLoadingTemplates(true)
            await doneTemplates()
            setLoadingTemplates(false)
            await setElectionDefinition(ballotPackage.electionDefinition)
          })
      } catch (error) {
        setErrorMessage(error.message)
        setIsLoadingBallotPackage(false)
      }
    }

    attemptToLoadBallotPackageFromUSB()
  }, [usbDriveStatus])

  if (isLoadingBallotPackage) {
    return (
      <Screen>
        <Main>
          <MainChild center>
            <Prose textCenter>
              <h1>Searching USB for ballot package…</h1>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
    )
  }

  if (isLoadingTemplates) {
    return (
      <Screen>
        <Main>
          <MainChild center>
            <Prose textCenter>
              <h1>Preparing scanner…</h1>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
    )
  }

  if (totalTemplates > 0 && currentUploadingBallot) {
    return (
      <Screen>
        <Main>
          <MainChild center>
            <Prose textCenter>
              <h1>
                Uploading ballot package {currentUploadingBallotIndex + 1} of{' '}
                {totalTemplates}
              </h1>
              <ul style={{ textAlign: 'left' }}>
                <li>
                  <strong>Ballot Style:</strong>{' '}
                  {currentUploadingBallot.ballotStyle}
                </li>
                <li>
                  <strong>Precinct:</strong> {currentUploadingBallot.precinct}
                </li>
                <li>
                  <strong>Test Ballot:</strong>{' '}
                  {currentUploadingBallot.isLiveMode ? 'No' : 'Yes'}
                </li>
                <li>
                  <strong>Languages:</strong>{' '}
                  {
                    /* istanbul ignore next */ currentUploadingBallot.locales ?? (
                      <em>(unknown)</em>
                    )
                  }
                </li>
              </ul>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
    )
  }

  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Precinct Scanner is Not Configured</h1>
            <p>
              {errorMessage === ''
                ? 'Insert USB Drive with configuration.'
                : `Error in configuration: ${errorMessage}`}
            </p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default UnconfiguredElectionScreen
