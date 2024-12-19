import {
  Caption,
  FullScreenIconWrapper,
  Icons,
  P,
  appStrings,
} from '@votingworks/ui';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

interface Props {
  scannedBallotCount: number;
}

export function ScanDoubleSheetScreen({
  scannedBallotCount,
}: Props): JSX.Element {
  return (
    <Screen centerContent ballotCountOverride={scannedBallotCount} voterFacing>
      <FullScreenPromptLayout
        title={appStrings.titleScannerBallotNotCounted()}
        image={
          <FullScreenIconWrapper>
            <Icons.Delete color="danger" />
          </FullScreenIconWrapper>
        }
      >
        <P>{appStrings.warningScannerMultipleSheetsDetected()}</P>
        <P>
          <Caption>{appStrings.instructionsScannerRemoveDoubleSheet()}</Caption>
        </P>
        <P>
          <Caption>{appStrings.noteAskPollWorkerForHelp()}</Caption>
        </P>
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next - @preserve */
export function DefaultPreview(): JSX.Element {
  return <ScanDoubleSheetScreen scannedBallotCount={42} />;
}
