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
      return 'Open';
    case 'unpause_polls':
      return 'Reopen';
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
      return 'Polls Opened Report';
    case 'unpause_polls':
      return 'Polls Reopened Report';
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

export function getPollTransitionsFromState(
  state: PollsState
): PollsTransition[] {
  switch (state) {
    case 'polls_open':
      return ['close_polls', 'pause_polls'];
    case 'polls_paused':
      return ['unpause_polls', 'close_polls'];
    case 'polls_closed_initial':
      return ['open_polls'];
    case 'polls_closed_final':
      return [];
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(state);
  }
}

// Used to determine, on VxMark, whether the polls state should be updated to
// match the polls state on a precinct scanner card tally.
export function isValidPollsStateChange(
  prevState: PollsState,
  newState: PollsState
): boolean {
  switch (prevState) {
    case 'polls_closed_initial':
      return newState === 'polls_open';
    case 'polls_open':
      return newState === 'polls_paused' || newState === 'polls_closed_final';
    case 'polls_paused':
      return newState === 'polls_open' || newState === 'polls_closed_final';
    case 'polls_closed_final':
      return false;
    /* istanbul ignore next */
    default:
      throwIllegalValue(prevState);
  }
}
export function getPollsTransitionActionPastTense(
  transition: PollsTransition
): string {
  switch (transition) {
    case 'close_polls':
      return 'Closed';
    case 'open_polls':
      return 'Opened';
    case 'unpause_polls':
      return 'Reopened';
    case 'pause_polls':
      return 'Paused';
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(transition);
  }
}
