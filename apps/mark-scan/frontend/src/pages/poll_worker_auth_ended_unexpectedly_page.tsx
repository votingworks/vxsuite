import { appStrings, Icons, P } from '@votingworks/ui';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';

export function PollWorkerAuthEndedUnexpectedlyPage(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title={appStrings.noteBmdSessionRestart()}
      voterFacing={false}
    >
      <P>
        The poll worker card was removed before paper loading completed. Please
        try again.
      </P>
    </CenteredCardPageLayout>
  );
}
