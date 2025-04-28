import { InsertBallotImage, P, appStrings } from '@votingworks/ui';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

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
  return <InsertBallotScreen scannedBallotCount={0} isTestMode={false} />;
}

/* istanbul ignore next - @preserve */
export function ManyBallotsScannedPreview(): JSX.Element {
  return <InsertBallotScreen scannedBallotCount={1234} isTestMode={false} />;
}
