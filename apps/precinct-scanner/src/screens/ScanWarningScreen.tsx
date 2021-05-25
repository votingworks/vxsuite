/* istanbul ignore file */
import { AdjudicationReason } from '@votingworks/types'
import { Button, Prose, Text } from '@votingworks/ui'
import React, { useContext, useState } from 'react'
import { Absolute } from '../components/Absolute'
import { Bar } from '../components/Bar'
import { ExclamationTriangle } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import Modal from '../components/Modal'
import {
  AdjudicationReasonInfo,
  BlankBallotAdjudicationReasonInfo,
  OvervoteAdjudicationReasonInfo,
} from '../config/types'
import AppContext from '../contexts/AppContext'
import { toSentence } from '../utils/toSentence'

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
    (a): a is OvervoteAdjudicationReasonInfo =>
      a.type === AdjudicationReason.Overvote
  )
  const blankReasons = adjudicationReasonInfo.filter(
    (a): a is BlankBallotAdjudicationReasonInfo =>
      a.type === AdjudicationReason.BlankBallot
  )
  const isOvervote = overvoteReasons.length > 0
  const isBlank = blankReasons.length > 0

  const overvoteContests = electionDefinition!.election.contests.filter((c) =>
    overvoteReasons.some((o) => c.id === o.contestId)
  )
  const overvoteContestNames = toSentence(
    overvoteContests.map(({ id, title }) => <strong key={id}>{title}</strong>)
  )

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
              Remove ballot and ask a poll worker for a new ballot.
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
