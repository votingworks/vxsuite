import { P, appStrings, Icons } from '@votingworks/ui';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export function UnrecoverableErrorPage(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title={appStrings.unrecoverableError()}
      voterFacing
    >
      <P>{appStrings.unrecoverableErrorInstruction()}</P>
    </CenteredCardPageLayout>
  );
}
