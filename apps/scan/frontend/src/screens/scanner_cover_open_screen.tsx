import { H1, P, appStrings } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';

export function ScannerCoverOpenScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing showTestModeBanner={false}>
      <CenteredText>
        <H1>{appStrings.titleScannerCoverIsOpen()}</H1>
        <P>{appStrings.instructionsAskForHelp()}</P>
      </CenteredText>
    </ScreenMainCenterChild>
  );
}
