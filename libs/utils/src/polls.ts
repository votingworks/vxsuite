import {
  PollsState,
  PollsSuspensionTransitionType,
  PollsTransitionType,
} from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';

export function getPollsTransitionDestinationState(
  transitionType: PollsTransitionType
): PollsState {
  switch (transitionType) {
    case 'open_polls':
    case 'resume_voting':
      return 'polls_open';
    case 'pause_voting':
      return 'polls_paused';
    case 'close_polls':
      return 'polls_closed_final';
    /* istanbul ignore next */
    default:
      throwIllegalValue(transitionType);
  }
}

export function getPollsTransitionAction(
  transitionType: PollsTransitionType
): string {
  switch (transitionType) {
    case 'open_polls':
      return 'Open Polls';
    case 'pause_voting':
      return 'Pause Voting';
    case 'resume_voting':
      return 'Resume Voting';
    case 'close_polls':
      return 'Close Polls';
    /* istanbul ignore next */
    default:
      throwIllegalValue(transitionType);
  }
}

export function getPollsReportTitle(
  transitionType: PollsTransitionType
): string {
  switch (transitionType) {
    case 'open_polls':
      return 'Polls Opened Report';
    case 'resume_voting':
      return 'Voting Resumed Report';
    case 'pause_voting':
      return 'Voting Paused Report';
    case 'close_polls':
      return 'Polls Closed Report';
    /* istanbul ignore next */
    default:
      throwIllegalValue(transitionType);
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
    /* istanbul ignore next */
    default:
      throwIllegalValue(state);
  }
}

/**
 * Gets allowable polls transitions from a given polls state. The primary or
 * expected polls transition is first in the list.
 */
export function getPollTransitionsFromState(
  state: PollsState
): PollsTransitionType[] {
  switch (state) {
    case 'polls_open':
      return ['close_polls', 'pause_voting'];
    case 'polls_paused':
      return ['resume_voting', 'close_polls'];
    case 'polls_closed_initial':
      return ['open_polls'];
    case 'polls_closed_final':
      return [];
    /* istanbul ignore next */
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
  transitionType: PollsTransitionType
): string {
  switch (transitionType) {
    case 'close_polls':
      return 'Polls Closed';
    case 'open_polls':
      return 'Polls Opened';
    case 'resume_voting':
      return 'Voting Resumed';
    case 'pause_voting':
      return 'Voting Paused';
    /* istanbul ignore next */
    default:
      throwIllegalValue(transitionType);
  }
}

export function isPollsSuspensionTransition(
  transitionType: PollsTransitionType
): transitionType is PollsSuspensionTransitionType {
  switch (transitionType) {
    case 'close_polls':
    case 'open_polls':
      return false;
    case 'resume_voting':
    case 'pause_voting':
      return true;
    /* istanbul ignore next */
    default:
      throwIllegalValue(transitionType);
  }
}
