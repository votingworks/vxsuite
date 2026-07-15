import { H1, LoadingAnimation, P, appStrings } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';

export interface ScanProcessingScreenProps {
  isTestMode: boolean;
  /**
   * Hides the "Scanning the marks on your ballot." note. Used when the screen is
   * shown while casting an already-scanned ballot (the `accepting` state), where
   * no scanning is actually happening.
   */
  hideScanInProgressNote?: boolean;
}

export function ScanProcessingScreen({
  isTestMode,
  hideScanInProgressNote,
}: ScanProcessingScreenProps): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing showTestModeBanner={isTestMode}>
      <LoadingAnimation />
      <CenteredText>
        <H1>{appStrings.titleScannerProcessingScreen()}</H1>
        {!hideScanInProgressNote && (
          <P>{appStrings.noteScannerScanInProgress()}</P>
        )}
      </CenteredText>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanProcessingScreen isTestMode={false} />;
}
