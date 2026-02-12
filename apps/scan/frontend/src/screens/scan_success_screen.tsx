import { FullScreenIconWrapper, Icons, P, appStrings } from '@votingworks/ui';

import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  scannedBallotCount: number;
  isTestMode: boolean;
  isEarlyVotingMode: boolean;
}

export function ScanSuccessScreen({
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
      showEarlyVotingBanner={isEarlyVotingMode}
    >
      <FullScreenPromptLayout
        title={appStrings.titleScannerSuccessScreen()}
        image={
          <FullScreenIconWrapper>
            <Icons.Done color="success" />
          </FullScreenIconWrapper>
        }
      >
        <P>{appStrings.noteThankYouForVoting()}</P>
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return (
    <ScanSuccessScreen
      scannedBallotCount={42}
      isTestMode={false}
      isEarlyVotingMode={false}
    />
  );
}
