import React from 'react'
import styled from 'styled-components'
import { Election } from '@votingworks/types'
import Text from './Text'
import { localeWeedkayAndDate } from '../util/IntlDateTimeFormats'
import { MachineConfig } from '../config/types'

const StatusBar = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  background: #455a64;
  color: #ffffff;
  padding: 0.375rem 1rem;
`

export interface Props {
  election: Election
  electionHash?: string
  machineConfig: MachineConfig
}

const StatusFooter: React.FC<Props> = ({
  election,
  electionHash,
  machineConfig,
}) => {
  const electionDate =
    election && localeWeedkayAndDate.format(new Date(election?.date))

  return (
    <StatusBar>
      <Text small white center as="div">
        Scanner ID: <strong>{machineConfig.machineId}</strong>
      </Text>
      {election && (
        <Text small white center as="div">
          <strong>{election.title}</strong> — {electionDate} —{' '}
          {election.county.name}, {election.state}{' '}
          {electionHash && (
            <React.Fragment>
              — Election Hash: <strong>{electionHash.slice(0, 10)}</strong>
            </React.Fragment>
          )}
        </Text>
      )}
    </StatusBar>
  )
}

export default StatusFooter
