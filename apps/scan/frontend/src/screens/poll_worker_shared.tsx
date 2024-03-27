import { PollsTransitionType } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import {
  CenteredScreenProps,
  ScreenMainCenterChild,
} from '../components/layout';

export function Screen(
  props: Omit<CenteredScreenProps, 'infoBarMode' | 'voterFacing'>
): JSX.Element {
  const { children } = props;

  return (
    <ScreenMainCenterChild infoBarMode="pollworker" voterFacing={false}>
      {children}
    </ScreenMainCenterChild>
  );
}

export function getPostPollsTransitionHeaderText(
  pollsTransitionType: PollsTransitionType
): string {
  switch (pollsTransitionType) {
    case 'close_polls':
      return 'Polls are closed.';
    case 'open_polls':
      return 'Polls are open.';
    case 'resume_voting':
      return 'Voting resumed.';
    case 'pause_voting':
      return 'Voting paused.';
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(pollsTransitionType);
  }
}
