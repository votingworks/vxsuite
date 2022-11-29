import { getLogEventIdForPollsTransition } from './helpers';
import { LogEventId } from './log_event_ids';

test('getLogEventIdForPollsTransition', () => {
  expect(getLogEventIdForPollsTransition('open_polls')).toEqual(
    LogEventId.PollsOpened
  );
  expect(getLogEventIdForPollsTransition('resume_voting')).toEqual(
    LogEventId.VotingResumed
  );
  expect(getLogEventIdForPollsTransition('pause_voting')).toEqual(
    LogEventId.VotingPaused
  );
  expect(getLogEventIdForPollsTransition('close_polls')).toEqual(
    LogEventId.PollsClosed
  );
});
