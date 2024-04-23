import { CenteredLargeProse, H1, P, appStrings } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function ScannerCoverOpenScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing>
      <CenteredLargeProse>
        <H1>{appStrings.titleScannerCoverIsOpen()}</H1>
        <P>{appStrings.instructionsAskForHelp()}</P>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}
