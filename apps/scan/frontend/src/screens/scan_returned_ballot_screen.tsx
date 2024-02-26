import { Caption, CenteredLargeProse, H1, appStrings } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function ScanReturnedBallotScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing>
      {/* TODO: make a graphic for this screen */}
      <CenteredLargeProse>
        <H1>{appStrings.titleRemoveYourBallot()}</H1>
        <Caption>{appStrings.noteAskPollWorkerForHelp()}</Caption>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanReturnedBallotScreen />;
}
