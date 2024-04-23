import { appStrings, Icons, P } from '@votingworks/ui';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export function JammedPage(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title={appStrings.titleBmdJammedScreen()}
      voterFacing
    >
      <P>{appStrings.instructionsBmdPaperJam()}</P>
    </CenteredCardPageLayout>
  );
}
