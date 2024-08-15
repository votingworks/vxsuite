import { InsertBallotImage, P, appStrings } from '@votingworks/ui';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  isLiveMode: boolean;
  scannedBallotCount: number;
}

export function InsertBallotScreen({
  isLiveMode,
  scannedBallotCount,
}: Props): JSX.Element {
  return (
    <Screen
      centerContent
      isLiveMode={isLiveMode}
      ballotCountOverride={scannedBallotCount}
      voterFacing
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
  return <InsertBallotScreen scannedBallotCount={0} isLiveMode />;
}

/* istanbul ignore next */
export function ManyBallotsScannedPreview(): JSX.Element {
  return <InsertBallotScreen scannedBallotCount={1234} isLiveMode />;
}
