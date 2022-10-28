import { PollsState, PollsTransition } from '@votingworks/types';
import { throwIllegalValue } from './assert';

export function getPollsTransitionDestinationState(
  transition: PollsTransition
): PollsState {
  switch (transition) {
    case 'open_polls':
    case 'unpause_polls':
      return 'polls_open';
    case 'pause_polls':
      return 'polls_paused';
    case 'close_polls':
      return 'polls_closed_final';
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(transition);
  }
}

export function getPollsTransitionAction(transition: PollsTransition): string {
  switch (transition) {
    case 'open_polls':
    case 'unpause_polls':
      return 'Open';
    case 'pause_polls':
      return 'Pause';
    case 'close_polls':
      return 'Close';
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(transition);
  }
}

export function getPollsReportTitle(transition: PollsTransition): string {
  switch (transition) {
    case 'open_polls':
    case 'unpause_polls':
      return 'Polls Opened Report';
    case 'pause_polls':
      return 'Polls Paused Report';
    case 'close_polls':
      return 'Polls Closed Report';
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(transition);
  }
}

export function getPollsStateName(state: PollsState): string {
  switch (state) {
    case 'polls_open':
      return 'Open';
    case 'polls_paused':
      return 'Paused';
    case 'polls_closed_initial':
    case 'polls_closed_final':
      return 'Closed';
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(state);
  }
}
