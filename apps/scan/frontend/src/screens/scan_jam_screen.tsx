import {
  Caption,
  FullScreenIconWrapper,
  Icons,
  P,
  appStrings,
} from '@votingworks/ui';
import type { PrecinctScannerErrorType } from '@votingworks/types';
import { Screen } from '../components/layout.js';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout.js';

interface Props {
  error?: PrecinctScannerErrorType;
  scannedBallotCount: number;
  isTestMode: boolean;
}

// @coverage-defer
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
            <Icons.Cancel color="danger" />
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
