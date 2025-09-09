import { InsertBallotImage, P, appStrings } from '@votingworks/ui';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  scannedBallotCount: number;
}

export function InsertBallotScreen({ scannedBallotCount }: Props): JSX.Element {
  return (
    <Screen
      centerContent
      ballotCountOverride={scannedBallotCount}
      voterFacing
      showModeBanner
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
  return <InsertBallotScreen scannedBallotCount={0} />;
}

/* istanbul ignore next - @preserve */
export function ManyBallotsScannedPreview(): JSX.Element {
  return <InsertBallotScreen scannedBallotCount={1234} />;
}
