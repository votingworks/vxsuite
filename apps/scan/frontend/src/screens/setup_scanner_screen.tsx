import { CenteredLargeProse, H1, P, appStrings } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

interface Props {
  scannedBallotCount?: number;
}

export function SetupScannerScreen({ scannedBallotCount }: Props): JSX.Element {
  // If the power cord is plugged in, but we can't detect a scanner, it's an
  // internal wiring issue. Otherwise if we can't detect the scanner, the power
  // cord is likely not plugged in.
  return (
    <ScreenMainCenterChild ballotCountOverride={scannedBallotCount} voterFacing>
      <CenteredLargeProse>
        <H1>{appStrings.titleInternalConnectionProblem()}</H1>
        <P>{appStrings.instructionsAskForHelp()}</P>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function ScannerDisconnectedPreview(): JSX.Element {
  return <SetupScannerScreen scannedBallotCount={42} />;
}
