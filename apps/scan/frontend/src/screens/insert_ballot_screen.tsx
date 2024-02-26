import {
  Caption,
  Icons,
  InsertBallotImage,
  P,
  appStrings,
} from '@votingworks/ui';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  isLiveMode: boolean;
  scannedBallotCount: number;
  showNoChargerWarning: boolean;
}

export function InsertBallotScreen({
  isLiveMode,
  scannedBallotCount,
  showNoChargerWarning,
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
        {showNoChargerWarning && (
          <Caption>
            <Icons.Warning color="warning" /> {appStrings.warningNoPower()}
          </Caption>
        )}
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next */
export function ZeroBallotsScannedPreview(): JSX.Element {
  return (
    <InsertBallotScreen
      scannedBallotCount={0}
      isLiveMode
      showNoChargerWarning={false}
    />
  );
}

/* istanbul ignore next */
export function ManyBallotsScannedPreview(): JSX.Element {
  return (
    <InsertBallotScreen
      scannedBallotCount={1234}
      isLiveMode
      showNoChargerWarning={false}
    />
  );
}

/* istanbul ignore next */
export function NoPowerConnectedTestModePreview(): JSX.Element {
  return (
    <InsertBallotScreen
      isLiveMode={false}
      scannedBallotCount={1234}
      showNoChargerWarning
    />
  );
}
