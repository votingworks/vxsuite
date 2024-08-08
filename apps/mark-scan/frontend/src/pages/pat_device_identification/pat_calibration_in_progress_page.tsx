import { Icons, P } from '@votingworks/ui';
import { CenteredCardPageLayout } from '../../components/centered_card_page_layout';

export function PatCalibrationInProgressPage(): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title="Device Calibration In Progress"
      voterFacing={false}
    >
      <P>
        PAT (Sip & Puff) device calibration is in progress. Please remove your
        card and either complete or end the calibration.
      </P>
    </CenteredCardPageLayout>
  );
}
