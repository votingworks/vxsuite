import React from 'react'
import styled from 'styled-components'
import { Election } from '@votingworks/types'
import Text from './Text'
import { localeWeedkayAndDate } from '../util/IntlDateTimeFormats'

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
}

const StatusFooter: React.FC<Props> = ({ election, electionHash }) => {
  const electionDate =
    election && localeWeedkayAndDate.format(new Date(election?.date))

  return (
    <StatusBar>
      {election && (
        <Text small white center as="div">
          <strong>{election.title}</strong> — {electionDate} —{' '}
          {election.county.name}, {election.state}
        </Text>
      )}
      {electionHash && (
        <Text small white center as="div">
          Election Hash: <strong>{electionHash.slice(0, 10)}</strong>
        </Text>
      )}
    </StatusBar>
  )
}

export default StatusFooter
