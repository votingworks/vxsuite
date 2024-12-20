import { PollsTransitionType } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import { LogEventId } from './log_event_ids';

export function getLogEventIdForPollsTransition(
  transitionType: PollsTransitionType
): LogEventId {
  switch (transitionType) {
    case 'open_polls':
      return LogEventId.PollsOpened;
    case 'pause_voting':
      return LogEventId.VotingPaused;
    case 'resume_voting':
      return LogEventId.VotingResumed;
    case 'close_polls':
      return LogEventId.PollsClosed;
    default:
      throwIllegalValue(transitionType);
  }
}
