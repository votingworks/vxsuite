import {
  CenteredLargeProse,
  H1,
  LoadingAnimation,
  P,
  appStrings,
} from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function ScanProcessingScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing>
      <LoadingAnimation />
      <CenteredLargeProse>
        <H1>{appStrings.titleScannerProcessingScreen()}</H1>
        <P>{appStrings.noteScannerScanInProgress()}</P>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanProcessingScreen />;
}
