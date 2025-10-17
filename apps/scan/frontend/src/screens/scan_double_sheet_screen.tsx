import {
  Caption,
  FullScreenIconWrapper,
  Icons,
  P,
  appStrings,
} from '@votingworks/ui';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  scannedBallotCount: number;
  isTestMode: boolean;
}

export function ScanDoubleSheetScreen({
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
        title={appStrings.titleScannerMultipleSheetsDetected()}
        image={
          <FullScreenIconWrapper>
            <Icons.Delete color="danger" />
          </FullScreenIconWrapper>
        }
      >
        <P weight="bold">{appStrings.instructionsScannerRemoveDoubleSheet()}</P>
        <Caption>{appStrings.noteAskPollWorkerForHelp()}</Caption>
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return <ScanDoubleSheetScreen scannedBallotCount={42} isTestMode={false} />;
}
