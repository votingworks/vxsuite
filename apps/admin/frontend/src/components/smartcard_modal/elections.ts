import { Election } from '@votingworks/types';
import { format } from '@votingworks/utils';

export function electionToDisplayString(election: Election): string {
  const electionDateFormatted = format.localeWeekdayAndDate(
    election.date.toMidnightDatetimeWithSystemTimezone()
  );
  return `${election.title} — ${electionDateFormatted}`;
}
