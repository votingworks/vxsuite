import React, { useState } from 'react'
import { useDropzone } from 'react-dropzone'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'
import Text from '../components/Text'
import { SetElection } from '../config/types'
import { readBallotPackage, BallotPackageEntry } from '../util/ballot-package'
import { put as putElection } from '../api/election'

interface Props {
  setElection: SetElection
}

const LoadElectionConfigScreen = ({ setElection }: Props) => {
  const [
    currentUploadingBallotIndex,
    setCurrentUploadingBallotIndex,
  ] = useState(-1)
  const [totalTemplates, setTotalTemplates] = useState(0)
  const [currentUploadingBallot, setCurrentUploadingBallot] = useState<
    BallotPackageEntry
  >()

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 1) {
      const file = acceptedFiles[0]
      const isElectionJSON = file.type === 'application/json'
      const reader = new FileReader()

      if (isElectionJSON) {
        reader.onload = async () => {
          const election = JSON.parse(reader.result as string)
          await putElection(election)
          setElection(election)
        }

        reader.readAsText(file)
      } else {
        readBallotPackage(file).then(async (pkg) => {
          await putElection(pkg.election)
          setCurrentUploadingBallotIndex(0)
          setTotalTemplates(pkg.ballots.length)

          for (const ballot of pkg.ballots) {
            setCurrentUploadingBallot(ballot)

            const body = new FormData()

            body.append(
              'ballots',
              new Blob([ballot.live, ballot.test], { type: 'application/pdf' })
            )

            // eslint-disable-next-line no-await-in-loop
            await fetch('/scan/hmpb/addTemplates', { method: 'POST', body })
            setCurrentUploadingBallotIndex((prev) => prev + 1)
          }

          setElection(pkg.election)
        })

        reader.readAsArrayBuffer(file)
      }
    }
  }
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ['application/json', 'application/zip'],
  })

  if (totalTemplates > 0 && currentUploadingBallot) {
    return (
      <Screen {...getRootProps()}>
        <Main noPadding>
          <MainChild center padded>
            <Prose textCenter>
              <h1>
                Uploading ballot package {currentUploadingBallotIndex + 1} of{' '}
                {totalTemplates}
              </h1>
              <p>
                {currentUploadingBallot.ballotStyle.id} /{' '}
                {currentUploadingBallot.precinct.name}
              </p>
            </Prose>
          </MainChild>
        </Main>
      </Screen>
    )
  }

  return (
    <Screen {...getRootProps()}>
      <Main noPadding>
        <MainChild center padded>
          <input {...getInputProps()} />
          <Prose textCenter>
            {isDragActive ? (
              <p>Drop files here…</p>
            ) : (
              <React.Fragment>
                <h1>Not Configured</h1>
                <Text narrow>
                  Insert Election Clerk card, drag and drop{' '}
                  <code>election.json</code> or ballot package <code>zip</code>{' '}
                  file here, or click to browse for file.
                </Text>
              </React.Fragment>
            )}
          </Prose>
        </MainChild>
      </Main>
      <MainNav />
    </Screen>
  )
}

export default LoadElectionConfigScreen
