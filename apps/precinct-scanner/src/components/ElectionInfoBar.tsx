import React, { useContext } from 'react'

import { Prose, Text, contrastTheme, NoWrap } from '@votingworks/ui'
import { getPrecinctById } from '@votingworks/types'
import { Bar, BarSpacer } from './Bar'
import { localeWeekdayAndDate } from '../utils/IntlDateTimeFormats'
import AppContext from '../contexts/AppContext'

export type InfoBarMode = 'voter' | 'pollworker' | 'admin'

interface Props {
  mode?: InfoBarMode
}
const ElectionInfoBar: React.FC<Props> = ({ mode = 'voter' }) => {
  const { electionDefinition, currentPrecinctId, machineConfig } = useContext(
    AppContext
  )
  if (!electionDefinition) {
    return null
  }
  const electionDate = localeWeekdayAndDate.format(
    new Date(electionDefinition.election.date)
  )
  const precinct =
    currentPrecinctId !== undefined
      ? getPrecinctById({
          election: electionDefinition.election,
          precinctId: currentPrecinctId,
        })
      : undefined
  return (
    <Bar theme={{ ...contrastTheme.dark }}>
      <Prose maxWidth={false} compact>
        <NoWrap as="strong">{electionDefinition.election.title}</NoWrap> —{' '}
        <NoWrap>{electionDate}</NoWrap>
        <Text as="div" small>
          <NoWrap>{precinct?.name ?? 'All Precincts'}</NoWrap> —{' '}
          <NoWrap>
            {electionDefinition.election.county.name},{' '}
            {electionDefinition.election.state}
          </NoWrap>
        </Text>
      </Prose>
      <BarSpacer />
      {mode !== 'voter' && (
        <React.Fragment>
          <Prose maxWidth={false} compact textRight>
            <Text as="div" small>
              Software Version
            </Text>
            <strong>{machineConfig.codeVersion}</strong>
          </Prose>
          <Prose maxWidth={false} compact textRight>
            <Text as="div" small>
              Machine ID
            </Text>
            <strong>{machineConfig.machineId}</strong>
          </Prose>
        </React.Fragment>
      )}
      <Prose maxWidth={false} compact textRight>
        <Text as="div" small>
          Election ID
        </Text>
        <strong>{electionDefinition.electionHash.slice(0, 10)}</strong>
      </Prose>
    </Bar>
  )
}

export default ElectionInfoBar
