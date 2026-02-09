import { H1, LoadingAnimation, P, appStrings } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';

export interface ScanProcessingScreenProps {
  isTestMode: boolean;
  isEarlyVotingMode: boolean;
}

export function ScanProcessingScreen({
  isTestMode,
  isEarlyVotingMode,
}: ScanProcessingScreenProps): JSX.Element {
  return (
    <ScreenMainCenterChild
      voterFacing
      showTestModeBanner={isTestMode}
      showEarlyVotingBanner={isEarlyVotingMode}
    >
      <LoadingAnimation />
      <CenteredText>
        <H1>{appStrings.titleScannerProcessingScreen()}</H1>
        <P>{appStrings.noteScannerScanInProgress()}</P>
      </CenteredText>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return <ScanProcessingScreen isTestMode={false} isEarlyVotingMode={false} />;
}
