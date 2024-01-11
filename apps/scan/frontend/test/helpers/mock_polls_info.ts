import { throwIllegalValue } from '@votingworks/basics';
import type {
  PollsTransition,
  PrecinctScannerPollsInfo,
} from '@votingworks/scan-backend';
import { PollsState, PollsTransitionType } from '@votingworks/types';

/**
 * Because you can get to the opened state by either opening polls or resuming
 * voting, we don't know exactly what the last transition was. But we want to
 * interpolate our best guess for testing ease.
 */
function getLikelyLastPollsTransitionType(
  pollsState: Exclude<PollsState, 'polls_closed_initial'>
): PollsTransitionType {
  switch (pollsState) {
    case 'polls_closed_final':
      return 'close_polls';
    case 'polls_open':
      return 'open_polls';
    case 'polls_paused':
      return 'pause_voting';
    // istanbul ignore next
    default:
      throwIllegalValue(pollsState);
  }
}

export function mockPollsInfo(
  pollsState: PollsState,
  lastPollsTransition?: Partial<PollsTransition>
): PrecinctScannerPollsInfo {
  if (pollsState === 'polls_closed_initial') {
    return {
      pollsState,
    };
  }
  return {
    pollsState,
    lastPollsTransition: {
      type: getLikelyLastPollsTransitionType(pollsState),
      time: Date.now(),
      ballotCount: 0,
      ...(lastPollsTransition ?? {}),
    },
  };
}
