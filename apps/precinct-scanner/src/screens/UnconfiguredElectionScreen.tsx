import React, { useState, useEffect } from 'react'
import path from 'path'
import { OptionalElectionDefinition, getPrecinctById } from '@votingworks/types'
import { ballotPackageUtils, usbstick } from '@votingworks/utils'
import { addTemplates, doneTemplates } from '../api/hmpb'
import {
  PRECINCT_SCANNER_FOLDER,
  BALLOT_PACKAGE_FILENAME,
} from '../config/globals'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import {
  QuestionCircle,
  IndeterminateProgressBar,
} from '../components/Graphics'

interface Props {
  usbDriveStatus: usbstick.UsbDriveStatus
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
      if (usbDriveStatus !== usbstick.UsbDriveStatus.mounted) {
        setErrorMessage('')
        setIsLoadingBallotPackage(false)
        setLoadingTemplates(false)
        setTotalTemplates(0)
        return
      }
      setIsLoadingBallotPackage(true)

      try {
        const usbPath = await usbstick.getDevicePath()
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
        const ballotPackage = await ballotPackageUtils.readBallotPackageFromFilePointer(
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

    // function handles its own errors, so no `.catch` needed
    void attemptToLoadBallotPackageFromUSB()
  }, [usbDriveStatus])

  let content = (
    <React.Fragment>
      <QuestionCircle />
      <CenteredLargeProse>
        <h1>Precinct Scanner is Not Configured</h1>
        <p>
          {errorMessage === ''
            ? 'Insert USB Drive with configuration.'
            : `Error in configuration: ${errorMessage}`}
        </p>
      </CenteredLargeProse>
    </React.Fragment>
  )
  if (isLoadingBallotPackage) {
    content = (
      <React.Fragment>
        <IndeterminateProgressBar />
        <CenteredLargeProse>
          <h1>Searching USB for ballot package…</h1>
        </CenteredLargeProse>
      </React.Fragment>
    )
  }

  if (isLoadingTemplates) {
    content = (
      <React.Fragment>
        <IndeterminateProgressBar />
        <CenteredLargeProse>
          <h1>Preparing scanner…</h1>
        </CenteredLargeProse>
      </React.Fragment>
    )
  }

  if (totalTemplates > 0 && currentUploadingBallot) {
    content = (
      <React.Fragment>
        <IndeterminateProgressBar />
        <CenteredLargeProse>
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
        </CenteredLargeProse>
      </React.Fragment>
    )
  }

  return <CenteredScreen infoBar={false}>{content}</CenteredScreen>
}

export default UnconfiguredElectionScreen

/* istanbul ignore next */
export const DefaultPreview: React.FC = () => {
  return (
    <UnconfiguredElectionScreen
      usbDriveStatus={usbstick.UsbDriveStatus.notavailable}
      setElectionDefinition={() => Promise.resolve()}
    />
  )
}
