import React, { useContext, useEffect, useState } from 'react'
import { Election } from '@votingworks/ballot-encoder'

import AppContext from '../contexts/AppContext'

import {
  getBallotStylesDataByStyle,
  getPrecinctById,
  getBallotFileName,
} from '../utils/election'
import DownloadableArchive from '../utils/DownloadableArchive'

import { MainChild } from '../components/Main'
import { Monospace } from '../components/Text'
import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'

const ExportElectionBallotPackageScreen = () => {
  const { election: e, electionHash } = useContext(AppContext)
  const election = e as Election

  const ballotStylesDataByStyle = getBallotStylesDataByStyle(election)
  const [ballotIndex, setBallotIndex] = useState(0)
  const ballot = ballotStylesDataByStyle[ballotIndex]
  const { contestIds, precinctId, ballotStyleId } = ballot
  const ballotCount = ballotStylesDataByStyle.length
  const [isChoosingFile, setIsChoosingFile] = useState(true)
  const [downloadFailed, setDownloadFailed] = useState(false)
  const [downloadComplete, setDownloadComplete] = useState(false)
  const [archive] = useState(new DownloadableArchive())
  const precinctName = getPrecinctById({
    election,
    precinctId: ballot.precinctId,
  })!.name

  useEffect(() => {
    const saveBallotPDF = async () => {
      const name = getBallotFileName({
        ballotStyleId,
        election,
        electionHash,
        precinctId,
      })
      const data = await kiosk!.printToPDF()
      await archive.file(name, Buffer.from(data))
      setBallotIndex((ballotIndex) => ballotIndex + 1)
    }

    if (!downloadFailed && isChoosingFile) {
      ;(async () => {
        try {
          await archive.begin()
          await archive.file(
            'election.json',
            JSON.stringify(election, undefined, 2)
          )
          setIsChoosingFile(false)
          setDownloadFailed(false)
        } catch {
          setIsChoosingFile(false)
          setDownloadFailed(true)
        }
      })()
    } else if (ballotIndex + 1 < ballotCount) {
      saveBallotPDF()
    } else {
      ;(async () => {
        await archive.end()
        setDownloadComplete(true)
      })()
    }
  }, [
    archive,
    ballotCount,
    ballotIndex,
    ballotStyleId,
    downloadFailed,
    election,
    electionHash,
    isChoosingFile,
    precinctId,
    setDownloadFailed,
    setIsChoosingFile,
  ])

  if (downloadFailed) {
    return (
      <MainChild>
        <h1>Download Failed</h1>
      </MainChild>
    )
  }

  if (downloadComplete) {
    return (
      <MainChild>
        <h1>Download Complete</h1>
      </MainChild>
    )
  }
  return (
    <MainChild>
      <h1>
        Generating Ballot {ballotIndex + 1} of {ballotCount}
      </h1>
      <ul>
        <li>
          Ballot Style: <strong>{ballot.ballotStyleId}</strong>
        </li>
        <li>
          Precinct: <strong>{precinctName}</strong>
        </li>
        <li>
          Contest count: <strong>{contestIds.length}</strong>
        </li>
        <li>
          Filename:{' '}
          <Monospace>
            {getBallotFileName({
              ballotStyleId,
              election,
              electionHash,
              precinctId,
            })}
          </Monospace>
        </li>
      </ul>
      <HandMarkedPaperBallot
        ballotStyleId={ballotStyleId}
        election={election}
        precinctId={precinctId}
      />
    </MainChild>
  )
}

export default ExportElectionBallotPackageScreen
