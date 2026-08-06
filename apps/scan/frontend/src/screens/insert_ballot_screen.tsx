import { InsertBallotImage, P, appStrings } from '@votingworks/ui';
import { Screen } from '../components/layout.js';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout.js';

interface Props {
  scannedBallotCount: number;
  isTestMode: boolean;
}

export function InsertBallotScreen({
  scannedBallotCount,
  isTestMode,
}: Props): JSX.Element {
  return (
    <Screen
      centerContent
      ballotCountOverride={scannedBallotCount}
      voterFacing
      showTestModeBanner={isTestMode}
      // Don't read aloud "Insert your ballot" to ensure that prior "Your ballot was counted" audio
      // is not interrupted
      disableReadOnLoad
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

/* istanbul ignore next */
export function ZeroBallotsScannedPreview(): JSX.Element {
  return <InsertBallotScreen scannedBallotCount={0} isTestMode={false} />;
}

/* istanbul ignore next */
export function ManyBallotsScannedPreview(): JSX.Element {
  return <InsertBallotScreen scannedBallotCount={1234} isTestMode={false} />;
}
