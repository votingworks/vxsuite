/* istanbul ignore file */
import React, { useState, useContext } from 'react'
import { Button, Prose, Text } from '@votingworks/ui'

import { AdjudicationReason, AnyContest } from '@votingworks/types'
import {
  AdjudicationReasonInfo,
  OvervoteAdjudicationReasonInfo,
} from '../config/types'
import { ExclamationTriangle } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import { Absolute } from '../components/Absolute'
import { Bar } from '../components/Bar'
import Modal from '../components/Modal'
import AppContext from '../contexts/AppContext'

interface Props {
  acceptBallot: () => Promise<void>
  adjudicationReasonInfo: AdjudicationReasonInfo[]
}
const ScanWarningScreen: React.FC<Props> = ({
  acceptBallot,
  adjudicationReasonInfo,
}) => {
  const { electionDefinition } = useContext(AppContext)
  const [confirmTabulate, setConfirmTabulate] = useState(false)
  const openConfirmTabulateModal = () => setConfirmTabulate(true)
  const closeConfirmTabulateModal = () => setConfirmTabulate(false)

  const tabulateBallot = () => {
    closeConfirmTabulateModal()
    acceptBallot()
  }

  const overvoteReasons = adjudicationReasonInfo.filter(
    (a) => a.type === AdjudicationReason.Overvote
  )
  const blankReasons = adjudicationReasonInfo.filter(
    (a) => a.type === AdjudicationReason.BlankBallot
  )
  const isOvervote = overvoteReasons.length > 0
  const isBlank = blankReasons.length > 0

  const overvoteContests: AnyContest[] = overvoteReasons
    .map((o) =>
      electionDefinition!.election.contests.find(
        (c) => c.id === (o as OvervoteAdjudicationReasonInfo).contestId
      )
    )
    .filter((c): c is AnyContest => !!c)
  let overvoteContestNames = ''
  if (overvoteContests.length === 1) {
    overvoteContestNames = overvoteContests[0]!.title
  } else if (overvoteContests.length > 1) {
    overvoteContestNames = `${overvoteContests
      .slice(0, overvoteContests.length - 1)
      .map((c) => c.title)
      .join(', ')} and ${overvoteContests[overvoteContests.length - 1]!.title} `
  }

  return (
    <CenteredScreen infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>{isBlank ? 'Blank Ballot' : 'Ballot Requires Review'}</h1>
        {isOvervote ? (
          <React.Fragment>
            <p>Too many marks for:</p>
            <p>{overvoteContestNames}</p>
            <Text italic>
              Remove ballot and ask the poll worker for a new ballot.
            </Text>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <p>Remove the ballot, fix the issue, then scan again.</p>
            <Text italic>Ask a poll worker if you need assistance.</Text>
          </React.Fragment>
        )}
      </CenteredLargeProse>
      <Absolute bottom left right>
        <Bar style={{ justifyContent: 'flex-end' }}>
          <div>
            Optionally, this ballot can be tabulated as is:{' '}
            <Button onPress={openConfirmTabulateModal}>Tabulate Ballot</Button>
          </div>
        </Bar>
      </Absolute>
      {confirmTabulate && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Tabulate Ballot with Errors?</h1>
              <p>Contests with errors will not be counted.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={tabulateBallot}>
                Yes, Tabulate Ballot
              </Button>
              <Button onPress={closeConfirmTabulateModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeConfirmTabulateModal}
        />
      )}
    </CenteredScreen>
  )
}

export default ScanWarningScreen
