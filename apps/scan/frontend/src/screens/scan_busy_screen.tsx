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
}

// @coverage-defer
export function ScanBusyScreen({
  isTestMode,
}: ScanBusyScreenProps): JSX.Element {
  return (
    <Screen centerContent voterFacing showTestModeBanner={isTestMode}>
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

// @coverage-exclude
export function DefaultPreview(): JSX.Element {
  return <ScanBusyScreen isTestMode={false} />;
}
