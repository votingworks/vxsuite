import { P, appStrings, Icons } from '@votingworks/ui';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';

export function UnrecoverableErrorPage(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title={appStrings.unrecoverableError()}
      voterFacing
    >
      <P>{appStrings.instructionsBmdAskForRestart()}</P>
    </CenteredCardPageLayout>
  );
}
