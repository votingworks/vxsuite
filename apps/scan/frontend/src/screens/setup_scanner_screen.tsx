import { CenteredLargeProse, H1, P, appStrings } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

interface Props {
  batteryIsCharging: boolean;
  scannedBallotCount?: number;
}

export function SetupScannerScreen({
  batteryIsCharging,
  scannedBallotCount,
}: Props): JSX.Element {
  // If the power cord is plugged in, but we can't detect a scanner, it's an
  // internal wiring issue. Otherwise if we can't detect the scanner, the power
  // cord is likely not plugged in.
  return (
    <ScreenMainCenterChild ballotCountOverride={scannedBallotCount} voterFacing>
      {batteryIsCharging ? (
        <CenteredLargeProse>
          <H1>{appStrings.titleInternalConnectionProblem()}</H1>
          <P>{appStrings.instructionsAskForHelp()}</P>
        </CenteredLargeProse>
      ) : (
        <CenteredLargeProse>
          <H1>{appStrings.titleNoPowerDetected()}</H1>
          <P>{appStrings.instructionsAskPollWorkerToPlugInPower()}</P>
        </CenteredLargeProse>
      )}
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function PowerDisconnectedPreview(): JSX.Element {
  return (
    <SetupScannerScreen batteryIsCharging={false} scannedBallotCount={42} />
  );
}

/* istanbul ignore next */
export function ScannerDisconnectedPreview(): JSX.Element {
  return <SetupScannerScreen batteryIsCharging scannedBallotCount={42} />;
}
