/* istanbul ignore file */
import React from 'react'

import { Precinct, ElectionDefinition } from '@votingworks/types'
import { Button, Prose } from '@votingworks/ui'
import { CenteredScreen } from '../components/Layout'
import { Absolute } from '../components/Absolute'
import { Bar } from '../components/Bar'

interface Props {
  appPrecinctId: string
  ballotsScannedCount: number
  electionDefinition: ElectionDefinition
  isPollsOpen: boolean
  togglePollsOpen: () => void
}

const PollWorkerScreen: React.FC<Props> = ({
  appPrecinctId,
  ballotsScannedCount,
  electionDefinition,
  isPollsOpen,
  togglePollsOpen,
}) => {
  const { election } = electionDefinition
  const precinct = election.precincts.find(
    (p) => p.id === appPrecinctId
  ) as Precinct

  return (
    <CenteredScreen infoBarMode="pollworker">
      <Prose textCenter>
        <h1>Poll Worker Actions</h1>
        <p>
          <Button large onPress={togglePollsOpen}>
            {isPollsOpen
              ? `Close Polls for ${precinct.name}`
              : `Open Polls for ${precinct.name}`}
          </Button>
        </p>
      </Prose>
      <Absolute top left>
        <Bar>
          <div>
            Ballots Scanned: <strong>{ballotsScannedCount}</strong>{' '}
          </div>
        </Bar>
      </Absolute>
    </CenteredScreen>
  )
}

export default PollWorkerScreen
