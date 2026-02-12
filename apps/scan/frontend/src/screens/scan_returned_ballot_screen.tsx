import { Caption, H1, appStrings } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';

export interface ScanReturnedBallotScreenProps {
  isTestMode: boolean;
  isEarlyVotingMode: boolean;
}

export function ScanReturnedBallotScreen({
  isTestMode,
  isEarlyVotingMode,
}: ScanReturnedBallotScreenProps): JSX.Element {
  return (
    <ScreenMainCenterChild
      voterFacing
      showTestModeBanner={isTestMode}
      showEarlyVotingBanner={isEarlyVotingMode}
    >
      {/* TODO: make a graphic for this screen */}
      <CenteredText>
        <H1>{appStrings.titleRemoveYourBallot()}</H1>
        <Caption>{appStrings.noteAskPollWorkerForHelp()}</Caption>
      </CenteredText>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return (
    <ScanReturnedBallotScreen isTestMode={false} isEarlyVotingMode={false} />
  );
}
