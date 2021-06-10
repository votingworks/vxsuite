import React, { useContext } from 'react'
import styled from 'styled-components'
import { format } from '@votingworks/utils'
import Text from './Text'
import AppContext from '../contexts/AppContext'

const StatusBar = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  background: #455a64;
  color: #ffffff;
  padding: 0.375rem 1rem;
`

const StatusFooter: React.FC = () => {
  const { electionDefinition, machineConfig } = useContext(AppContext)
  const electionDate =
    electionDefinition &&
    format.localeWeekdayAndDate(new Date(electionDefinition.election.date))

  return (
    <StatusBar>
      <Text small white center as="div">
        Scanner ID: <strong>{machineConfig.machineId}</strong>
      </Text>
      {electionDefinition && (
        <Text small white center as="div">
          <strong>{electionDefinition.election.title}</strong> — {electionDate}{' '}
          — {electionDefinition.election.county.name},{' '}
          {electionDefinition.election.state}{' '}
          {electionDefinition.electionHash && (
            <React.Fragment>
              — Election Hash:{' '}
              <strong>{electionDefinition.electionHash.slice(0, 10)}</strong>
            </React.Fragment>
          )}
        </Text>
      )}
    </StatusBar>
  )
}

export default StatusFooter
