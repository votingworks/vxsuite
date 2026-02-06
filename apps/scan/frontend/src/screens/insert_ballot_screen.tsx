import { InsertBallotImage, P, appStrings } from '@votingworks/ui';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  scannedBallotCount: number;
  isTestMode: boolean;
  isEarlyVotingMode: boolean;
}

export function InsertBallotScreen({
  scannedBallotCount,
  isTestMode,
  isEarlyVotingMode,
}: Props): JSX.Element {
  return (
    <Screen
      centerContent
      ballotCountOverride={scannedBallotCount}
      voterFacing
      showTestModeBanner={isTestMode}
      showEarlyVotingNotice={isEarlyVotingMode}
    >
      <FullScreenPromptLayout
        title={appStrings.titleScannerInsertBallotScreen()}
        image={<InsertBallotImage ballotFeedLocation="top" />}
      >
        <P>{appStrings.instructionsScannerInsertBallotScreen()}</P>
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next - @preserve */
export function ZeroBallotsScannedPreview(): JSX.Element {
  return (
    <InsertBallotScreen
      scannedBallotCount={0}
      isTestMode={false}
      isEarlyVotingMode={false}
    />
  );
}

/* istanbul ignore next - @preserve */
export function ManyBallotsScannedPreview(): JSX.Element {
  return (
    <InsertBallotScreen
      scannedBallotCount={1234}
      isTestMode={false}
      isEarlyVotingMode={false}
    />
  );
}
