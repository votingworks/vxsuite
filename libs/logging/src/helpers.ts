import { PollsTransition } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/utils';
import { LogEventId } from './log_event_ids';

export function getLogEventIdForPollsTransition(
  transition: PollsTransition
): LogEventId {
  switch (transition) {
    case 'open_polls':
      return LogEventId.PollsOpened;
    case 'pause_voting':
      return LogEventId.VotingPaused;
    case 'resume_voting':
      return LogEventId.VotingResumed;
    case 'close_polls':
      return LogEventId.PollsClosed;
    /* istanbul ignore next */
    default:
      throwIllegalValue(transition);
  }
}
