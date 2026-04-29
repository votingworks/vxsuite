import { DateTime } from 'luxon';
import { DateWithoutTime } from '@votingworks/basics';
import { SystemSettings } from '@votingworks/types';
import type { CvrFileMode } from '@votingworks/admin-backend';

/**
 * Returns true when VxAdmin should block tally reports, write-in adjudication
 * reports, and marking results official because polls have not yet closed.
 *
 * Only applies in official (non-test) file mode when the system setting
 * `disallowVxAdminTabulationBeforeElectionDayPollsCloseTime` is enabled and
 * the current time is before `electionDayPollsCloseTime` on election day.
 */
export function areClosedPollsActionsBlocked(
  fileMode?: CvrFileMode,
  systemSettings?: SystemSettings,
  electionDate?: DateWithoutTime
): boolean {
  if (
    fileMode === undefined ||
    fileMode === 'test' ||
    fileMode === 'unlocked' ||
    !systemSettings?.disallowVxAdminTabulationBeforeElectionDayPollsCloseTime ||
    !systemSettings?.electionDayPollsCloseTime ||
    !electionDate
  ) {
    return false;
  }
  const pollsCloseTime = DateTime.fromISO(
    `${electionDate.toISOString()}T${systemSettings.electionDayPollsCloseTime}`
  );
  return DateTime.now() < pollsCloseTime;
}
