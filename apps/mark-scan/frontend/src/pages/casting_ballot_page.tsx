import { InsertBallotImage, P, appStrings } from '@votingworks/ui';
import { CenteredPageLayout } from '../components/centered_page_layout';

export function CastingBallotPage(): JSX.Element {
  return (
    <CenteredPageLayout voterFacing>
      <InsertBallotImage />
      <P>{appStrings.noteBmdCastingBallot()}</P>
    </CenteredPageLayout>
  );
}
