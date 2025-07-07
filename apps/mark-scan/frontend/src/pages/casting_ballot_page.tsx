import { H2, InsertBallotImage, appStrings } from '@votingworks/ui';
import { CenteredPageLayout } from '@votingworks/mark-flow-ui';

export function CastingBallotPage(): JSX.Element {
  return (
    <CenteredPageLayout voterFacing>
      <InsertBallotImage />
      <H2 as="h1">{appStrings.noteBmdCastingBallot()}</H2>
    </CenteredPageLayout>
  );
}
