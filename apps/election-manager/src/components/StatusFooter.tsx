import React, { useContext } from 'react'
import styled from 'styled-components'
import Text from './Text'
import { localeWeedkayAndDate } from '../utils/IntlDateTimeFormats'
import AppContext from '../contexts/AppContext'

const StatusBar = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  background: #455a64;
  padding: 0.375rem 1rem;
  color: #ffffff;
`

const StatusFooter: React.FC = () => {
  const { electionDefinition } = useContext(AppContext)
  if (electionDefinition === undefined) {
    return null
  }

  const { election, electionHash } = electionDefinition
  const electionDate = localeWeedkayAndDate.format(new Date(election?.date))

  return (
    <StatusBar>
      <Text small white center as="div">
        <strong>{election.title}</strong> — {electionDate} —{' '}
        {election.county.name}, {election.state}{' '}
      </Text>
      <Text small white center as="div">
        <React.Fragment>
          Election Hash: <strong>{electionHash.slice(0, 10)}</strong>
        </React.Fragment>
      </Text>
    </StatusBar>
  )
}

export default StatusFooter
