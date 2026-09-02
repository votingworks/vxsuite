import { Caption, H1, appStrings } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout.js';

export interface ScanReturnedBallotScreenProps {
  isTestMode: boolean;
}

// @coverage-defer
export function ScanReturnedBallotScreen({
  isTestMode,
}: ScanReturnedBallotScreenProps): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing showTestModeBanner={isTestMode}>
      {/* TODO: make a graphic for this screen */}
      <CenteredText>
        <H1>{appStrings.titleRemoveYourBallot()}</H1>
        <Caption>{appStrings.noteAskPollWorkerForHelp()}</Caption>
      </CenteredText>
    </ScreenMainCenterChild>
  );
}

// @coverage-exclude
export function DefaultPreview(): JSX.Element {
  return <ScanReturnedBallotScreen isTestMode={false} />;
}
