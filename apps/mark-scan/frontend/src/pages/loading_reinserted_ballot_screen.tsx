import { appStrings, Icons, P } from '@votingworks/ui';

import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

export function LoadingReinsertedBallotScreen(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Info />}
      title={appStrings.titleBmdLoadingReinsertedBallotScreen()}
      voterFacing
    >
      <P>{appStrings.noteBmdScanningReinsertedBallot()}</P>
      <P>{appStrings.noteBmdPrintedBallotReviewNextSteps()}</P>
    </CenteredCardPageLayout>
  );
}
