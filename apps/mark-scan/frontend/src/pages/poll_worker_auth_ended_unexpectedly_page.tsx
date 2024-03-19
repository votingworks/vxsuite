import { appStrings, P } from '@votingworks/ui';
import { CenteredPageLayout } from '../components/centered_page_layout';

export function PollWorkerAuthEndedUnexpectedlyPage(): JSX.Element {
  return (
    <CenteredPageLayout title={appStrings.noteBmdSessionRestart()} voterFacing>
      <P>{appStrings.notePollWorkerAuthEndedBeforePaperLoadComplete()}</P>
    </CenteredPageLayout>
  );
}
