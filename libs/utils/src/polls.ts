import { PollsState, PollsTransition } from '@votingworks/types';
import { throwIllegalValue } from './assert';

export function getPollsTransitionDestinationState(
  transition: PollsTransition
): PollsState {
  switch (transition) {
    case 'open_polls':
    case 'resume_voting':
      return 'polls_open';
    case 'pause_voting':
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
      return 'Open Polls';
    case 'pause_voting':
      return 'Pause Voting';
    case 'resume_voting':
      return 'Resume Voting';
    case 'close_polls':
      return 'Close Polls';
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(transition);
  }
}

export function getPollsReportTitle(transition: PollsTransition): string {
  switch (transition) {
    case 'open_polls':
      return 'Polls Opened Report';
    case 'resume_voting':
      return 'Voting Resumed Report';
    case 'pause_voting':
      return 'Voting Paused Report';
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
      return ['close_polls', 'pause_voting'];
    case 'polls_paused':
      return ['resume_voting', 'close_polls'];
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
  if (prevState === newState) return false; // no change an invalid change
  if (prevState === 'polls_closed_final') return false; // cannot change if voting complete
  if (newState === 'polls_closed_initial') return false; // cannot revert to initial closed
  return true;
}
export function getPollsTransitionActionPastTense(
  transition: PollsTransition
): string {
  switch (transition) {
    case 'close_polls':
      return 'Polls Closed';
    case 'open_polls':
      return 'Polls Opened';
    case 'resume_voting':
      return 'Voting Resumed';
    case 'pause_voting':
      return 'Voting Paused';
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(transition);
  }
}
