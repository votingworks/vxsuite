import {
  P,
  appStrings,
  Icons,
  ERROR_SCREEN_MESSAGES,
} from '@votingworks/ui';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';
import { PollWorkerPrompt } from '../components/poll_worker_prompt';

export function UnrecoverableErrorPage(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title={appStrings.unrecoverableError()}
      voterFacing
    >
      <P>{appStrings.instructionsBmdAskForRestart()}</P>
      <PollWorkerPrompt>
        {ERROR_SCREEN_MESSAGES.REACH_OUT}
      </PollWorkerPrompt>
    </CenteredCardPageLayout>
  );
}
