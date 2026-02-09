import {
  Caption,
  FullScreenIconWrapper,
  Icons,
  P,
  appStrings,
} from '@votingworks/ui';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

export interface ScanBusyScreenProps {
  isTestMode: boolean;
  isEarlyVotingMode: boolean;
}

export function ScanBusyScreen({
  isTestMode,
  isEarlyVotingMode,
}: ScanBusyScreenProps): JSX.Element {
  return (
    <Screen
      centerContent
      voterFacing
      showTestModeBanner={isTestMode}
      showEarlyVotingBanner={isEarlyVotingMode}
    >
      <FullScreenPromptLayout
        title={appStrings.titleRemoveYourBallot()}
        image={
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        }
      >
        <P>{appStrings.warningScannerAnotherScanInProgress()}</P>
        <Caption>{appStrings.noteAskPollWorkerForHelp()}</Caption>
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return <ScanBusyScreen isTestMode={false} isEarlyVotingMode={false} />;
}
