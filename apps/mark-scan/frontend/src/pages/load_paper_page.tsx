import { P, appStrings } from '@votingworks/ui';
import { CenteredPageLayout } from '../components/centered_page_layout';

export function LoadPaperPage(): JSX.Element {
  return (
    <CenteredPageLayout
      title={appStrings.titleBmdLoadPaperScreen()}
      voterFacing
    >
      <P>{appStrings.instructionsBmdLoadPaper()}</P>
    </CenteredPageLayout>
  );
}
