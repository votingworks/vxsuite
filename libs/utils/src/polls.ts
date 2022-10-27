import { PollsState, PollsTransition } from '@votingworks/types';
import { throwIllegalValue } from './assert';

export function getPollsTransitionDestinationState(
  transition: PollsTransition
): PollsState {
  switch (transition) {
    case 'open_polls':
      return 'polls_open';
    case 'pause_polls':
      return 'polls_paused';
    case 'unpause_polls':
      return 'polls_open';
    case 'close_polls':
      return 'polls_closed_final';
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(transition);
  }
}

export function getPollsReportTitle(transition: PollsTransition): string {
  switch (transition) {
    case 'close_polls':
      return 'Polls Closed Report';
    case 'open_polls':
      return 'Polls Opened Report';
    case 'unpause_polls':
      return 'Polls Opened Report';
    case 'pause_polls':
      return 'Polls Paused Report';
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(transition);
  }
}
