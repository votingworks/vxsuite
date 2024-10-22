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
      return 'Polls Closed';
    case 'open_polls':
      return 'Polls Opened';
    case 'resume_voting':
      return 'Voting Resumed';
    case 'pause_voting':
      return 'Voting Paused';
    /* istanbul ignore next - compile-time check for completeness */
    default:
      throwIllegalValue(pollsTransitionType);
  }
}
