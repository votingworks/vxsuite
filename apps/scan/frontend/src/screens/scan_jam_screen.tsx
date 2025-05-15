import {
  Caption,
  FullScreenIconWrapper,
  Icons,
  P,
  appStrings,
} from '@votingworks/ui';
import { PrecinctScannerErrorType } from '@votingworks/types';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  error?: PrecinctScannerErrorType;
  scannedBallotCount: number;
  isTestMode: boolean;
}

export function ScanJamScreen({
  error,
  scannedBallotCount,
  isTestMode,
}: Props): JSX.Element {
  const isOutfeedBlocked = error === 'outfeed_blocked';
  return (
    <Screen
      centerContent
      ballotCountOverride={scannedBallotCount}
      voterFacing
      showTestModeBanner={isTestMode}
    >
      <FullScreenPromptLayout
        title={
          isOutfeedBlocked
            ? appStrings.titleScannerOutfeedBlocked()
            : appStrings.titleBallotJammed()
        }
        image={
          <FullScreenIconWrapper>
            <Icons.Delete color="danger" />
          </FullScreenIconWrapper>
        }
      >
        {!isOutfeedBlocked && (
          <P weight="bold">{appStrings.warningBallotNotCounted()}</P>
        )}
        <Caption>{appStrings.instructionsAskForHelp()}</Caption>
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next - @preserve */
export function InternalJamPreview(): JSX.Element {
  return <ScanJamScreen scannedBallotCount={42} isTestMode={false} />;
}

/* istanbul ignore next - @preserve */
export function OutfeedJamPreview(): JSX.Element {
  return (
    <ScanJamScreen
      scannedBallotCount={42}
      error="outfeed_blocked"
      isTestMode={false}
    />
  );
}
