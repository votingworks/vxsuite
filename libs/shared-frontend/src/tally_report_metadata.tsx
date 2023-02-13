import React from 'react';

import { Election } from '@votingworks/types';

import { format } from '@votingworks/shared';

import { Text } from './text';

interface Props {
  election: Election;
  generatedAtTime: Date;
  footer?: JSX.Element;
}

export function TallyReportMetadata({
  election,
  generatedAtTime,
  footer,
}: Props): JSX.Element {
  const electionDate = format.localeWeekdayAndDate(new Date(election.date));
  const generatedAt = format.localeLongDateAndTime(generatedAtTime);

  return (
    <p>
      {electionDate}, {election.county.name}, {election.state}
      <br />
      <Text small as="span">
        This report was created on {generatedAt}.
      </Text>
      {footer}
    </p>
  );
}
