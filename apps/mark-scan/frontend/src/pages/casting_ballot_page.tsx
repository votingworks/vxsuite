import { H2, InsertBallotImage, appStrings } from '@votingworks/ui';
import { CenteredPageLayout } from '../components/centered_page_layout';

export function CastingBallotPage(): JSX.Element {
  return (
    <CenteredPageLayout voterFacing>
      <InsertBallotImage />
      <H2 as="h1">{appStrings.noteBmdCastingBallot()}</H2>
    </CenteredPageLayout>
  );
}
