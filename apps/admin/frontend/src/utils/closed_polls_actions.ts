import { SystemSettings } from '@votingworks/types';
import type { CvrFileMode } from '@votingworks/admin-backend';

/**
 * Returns true when VxAdmin should block tally reports, write-in adjudication
 * reports, and marking results official because polls have not yet closed.
 *
 * Only applies in official (non-test) file mode when the system setting
 * `disallowVxAdminTabulationBeforeElectionDayPollsCloseTime` is enabled and
 * the current time is before `electionDayPollsCloseTime`.
 */
export function areClosedPollsActionsBlocked(
  fileMode?: CvrFileMode,
  systemSettings?: SystemSettings
): boolean {
  if (
    fileMode === undefined ||
    fileMode === 'test' ||
    !systemSettings?.disallowVxAdminTabulationBeforeElectionDayPollsCloseTime ||
    !systemSettings?.electionDayPollsCloseTime
  ) {
    return false;
  }
  return new Date(systemSettings.electionDayPollsCloseTime) > new Date();
}
