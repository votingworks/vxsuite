import { appStrings, P } from '@votingworks/ui';
import { CenteredPageLayout } from '../components/centered_page_layout';

export function JammedPage(): JSX.Element {
  return (
    <CenteredPageLayout title={appStrings.titleBmdJammedScreen()} voterFacing>
      <P>{appStrings.instructionsBmdPaperJam()}</P>
    </CenteredPageLayout>
  );
}
