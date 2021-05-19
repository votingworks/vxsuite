import React from 'react'

import { Prose, Text, contrastTheme, NoWrap } from '@votingworks/ui'
import {
  getPrecinctById,
  OptionalElectionDefinition,
  Precinct,
} from '@votingworks/types'
import { Bar, BarSpacer } from './Bar'
import { localeWeekdayAndDate } from '../utils/IntlDateTimeFormats'

export type InfoBarMode = 'voter' | 'pollworker' | 'admin'

interface Props {
  mode?: InfoBarMode
  electionDefinition: OptionalElectionDefinition
  currentPrecinctId?: Precinct['id']
}
const ElectionInfoBar: React.FC<Props> = ({
  electionDefinition,
  mode = 'voter',
  currentPrecinctId,
}) => {
  if (!electionDefinition) {
    return null
  }
  const electionDate = localeWeekdayAndDate.format(
    new Date(electionDefinition.election.date)
  )
  const precinct =
    typeof currentPrecinctId === 'string'
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
            <strong>2020-05-05-TODOTODO</strong>
          </Prose>
          <Prose maxWidth={false} compact textRight>
            <Text as="div" small>
              Machine ID
            </Text>
            <strong>TODO</strong>
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
