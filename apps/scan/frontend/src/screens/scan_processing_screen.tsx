import { H1, LoadingAnimation, P, appStrings } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';

export function ScanProcessingScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing>
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
  return <ScanProcessingScreen />;
}
