import { appStrings, P } from '@votingworks/ui';
import { CenteredPageLayout } from '../components/centered_page_layout';

interface Props {
  stateMachineState: 'jam_cleared' | 'resetting_state_machine_after_jam';
}

export function JamClearedPage({ stateMachineState }: Props): JSX.Element {
  const statusMessage =
    stateMachineState === 'jam_cleared'
      ? appStrings.noteBmdHardwareResetting()
      : appStrings.noteBmdHardwareReset();

  return (
    <CenteredPageLayout
      title={appStrings.titleBmdJamClearedScreen()}
      voterFacing
    >
      <P>
        {statusMessage} {appStrings.noteBmdSessionRestart()}
      </P>
    </CenteredPageLayout>
  );
}
