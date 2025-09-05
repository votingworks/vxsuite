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
}

export function ScanJamScreen({
  error,
  scannedBallotCount,
}: Props): JSX.Element {
  const isOutfeedBlocked = error === 'outfeed_blocked';
  return (
    <Screen
      centerContent
      ballotCountOverride={scannedBallotCount}
      voterFacing
      showModeBanner
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
  return <ScanJamScreen scannedBallotCount={42} />;
}

/* istanbul ignore next - @preserve */
export function OutfeedJamPreview(): JSX.Element {
  return <ScanJamScreen scannedBallotCount={42} error="outfeed_blocked" />;
}
