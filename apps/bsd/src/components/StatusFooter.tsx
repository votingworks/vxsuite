import React, { useContext } from 'react'
import styled from 'styled-components'
import Text from './Text'
import { localeWeedkayAndDate } from '../util/IntlDateTimeFormats'
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
  const { election, electionHash, machineConfig } = useContext(AppContext)
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
