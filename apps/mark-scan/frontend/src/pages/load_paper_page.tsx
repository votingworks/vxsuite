import { Icons, P } from '@votingworks/ui';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export function LoadPaperPage(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Info />}
      title="Load Blank Ballot Sheet"
      voterFacing={false}
    >
      <P>
        Please feed one sheet of paper into the front input tray. The printer
        will automatically grab the paper when positioned correctly.
      </P>
    </CenteredCardPageLayout>
  );
}
