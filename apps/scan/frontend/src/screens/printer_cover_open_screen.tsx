import { H1, P, appStrings } from '@votingworks/ui';
import { CenteredText, ScreenMainCenterChild } from '../components/layout';

export function PrinterCoverOpenScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild voterFacing showModeBanner={false}>
      <CenteredText>
        <H1>{appStrings.titlePrinterCoverIsOpen()}</H1>
        <P>{appStrings.instructionsAskForHelp()}</P>
      </CenteredText>
    </ScreenMainCenterChild>
  );
}
