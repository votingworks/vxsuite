import React, { useContext, useEffect, useState } from 'react'
import { Election } from '@votingworks/ballot-encoder'

import AppContext from '../contexts/AppContext'

import { getBallotStylesDataByStyle, getPrecinctById } from '../utils/election'

import { MainChild } from '../components/Main'
// import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'

const ExportElectionBallotPackageScreen = () => {
  const { election: e } = useContext(AppContext)
  const election = e as Election

  const ballotStylesDataByStyle = getBallotStylesDataByStyle(election)
  const [ballotIndex, setBallotIndex] = useState(0)
  const ballot = ballotStylesDataByStyle[ballotIndex]
  const ballotCount = ballotStylesDataByStyle.length
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadComplete, setDownloadComplete] = useState(false)

  useEffect(() => {
    const saveBallotPDF = (milliseconds = 500) =>
      new Promise((resolve) =>
        setTimeout(() => {
          setBallotIndex(ballotIndex + 1)
          return resolve
        }, milliseconds)
      )

    const initDownload = (milliseconds = 2000) =>
      new Promise((resolve) =>
        setTimeout(() => {
          setDownloadComplete(true)
          return resolve
        }, milliseconds)
      )

    if (ballotIndex + 1 < ballotCount) {
      saveBallotPDF()
    } else {
      setIsDownloading(true)
      initDownload()
    }
  }, [setIsDownloading, ballotIndex, ballotCount])

  if (downloadComplete) {
    return (
      <MainChild>
        <h1>Download Complete</h1>
      </MainChild>
    )
  }
  if (isDownloading) {
    return (
      <MainChild>
        <h1>Downloading Election Ballot Package…</h1>
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
          Precinct:{' '}
          <strong>
            {getPrecinctById({ election, precinctId: ballot.precinctId })?.name}
          </strong>
        </li>
      </ul>
      {/* <HandMarkedPaperBallot
        ballotStyleId={ballotStyleId}
        election={election}
        precinctId={precinctId}
      /> */}
    </MainChild>
  )
}

export default ExportElectionBallotPackageScreen
