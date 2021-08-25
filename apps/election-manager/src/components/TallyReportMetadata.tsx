import React from 'react'

import { Election } from '@votingworks/types'

import { format } from '@votingworks/utils'

import Text from './Text'

interface Props {
  election: Election
  generatedAtTime: Date
}

const TallyReportMetadata: React.FC<Props> = ({
  election,
  generatedAtTime
}) => {
  const electionDate = format.localeWeekdayAndDate(new Date(election.date))
  const generatedAt = format.localeLongDateAndTime(generatedAtTime)

  return (
    <p>
      {electionDate}, {election.county.name}, {election.state}
      <br />
      <Text small as='span'>
        This report was created on {generatedAt}
      </Text>
    </p>
  )
}

export default TallyReportMetadata
