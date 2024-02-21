import { Election } from '@votingworks/types';

import { format } from '@votingworks/utils';

import { Text } from '../text';

interface Props {
  election: Election;
  generatedAtTime?: Date;
}

export function TallyReportMetadata({
  election,
  generatedAtTime,
}: Props): JSX.Element {
  const electionDate = format.localeWeekdayAndDate(new Date(election.date));
  const generatedAt = format.localeLongDateAndTime(generatedAtTime);

  return (
    <p>
      {electionDate}, {election.county.name}, {election.state}
      <br />
      <Text small as="span">
        {generatedAtTime
          ? `This report was created on ${generatedAt}.`
          : 'Generating report...'}
      </Text>
    </p>
  );
}
