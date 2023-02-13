import { Election } from '@votingworks/types';
import { format } from '@votingworks/shared';

export function electionToDisplayString(election: Election): string {
  const electionDateFormatted = format.localeWeekdayAndDate(
    new Date(election.date)
  );
  return `${election.title} — ${electionDateFormatted}`;
}
