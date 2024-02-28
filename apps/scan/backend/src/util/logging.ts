import { throwIllegalValue } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { PollsState, PollsTransitionType } from '@votingworks/types';

export async function logPollsTransition(
  logger: Logger,
  transition: PollsTransitionType,
  previousPollsState: PollsState
): Promise<void> {
  const logEventId = (() => {
    switch (transition) {
      case 'close_polls':
        return LogEventId.PollsClosed;
      case 'pause_voting':
        if (previousPollsState === 'polls_closed_final') {
          return LogEventId.ResetPollsToPaused;
        }
        return LogEventId.VotingPaused;
      case 'resume_voting':
        return LogEventId.VotingResumed;
      case 'open_polls':
        return LogEventId.PollsOpened;
      /* istanbul ignore next */
      default:
        throwIllegalValue(transition);
    }
  })();
  await logger.logAsCurrentUser(logEventId, { disposition: 'success' });
}
