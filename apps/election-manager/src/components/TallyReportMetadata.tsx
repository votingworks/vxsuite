import React from 'react'

import { Election } from '@votingworks/types'

import {
  localeWeedkayAndDate,
  localeLongDateAndTime,
} from '../utils/IntlDateTimeFormats'

import Text from './Text'

interface Props {
  election: Election
  generatedAtTime: Date
}

const TallyReportMetadata: React.FC<Props> = ({
  election,
  generatedAtTime,
}) => {
  const electionDate = localeWeedkayAndDate.format(new Date(election.date))
  const generatedAt = localeLongDateAndTime.format(generatedAtTime)

  return (
    <p>
      {electionDate}, {election.county.name}, {election.state}
      <br />
      <Text small as="span">
        This report was created on {generatedAt}
      </Text>
    </p>
  )
}

export default TallyReportMetadata
