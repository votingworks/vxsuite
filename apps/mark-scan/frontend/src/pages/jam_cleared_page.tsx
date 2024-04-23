import { appStrings, Icons, P } from '@votingworks/ui';
import type { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import React from 'react';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

const JAM_CLEARED_STATES = [
  'jam_cleared',
  'resetting_state_machine_after_jam',
] as const satisfies readonly SimpleServerStatus[];

export type JamClearedState = (typeof JAM_CLEARED_STATES)[number];

interface Props {
  stateMachineState: JamClearedState;
}

const STATUS_MESSAGES: Readonly<Record<JamClearedState, JSX.Element>> = {
  jam_cleared: (
    <React.Fragment>
      <Icons.Loading /> {appStrings.noteBmdHardwareResetting()}
    </React.Fragment>
  ),
  resetting_state_machine_after_jam: (
    <React.Fragment>
      <Icons.Done color="success" /> {appStrings.noteBmdHardwareReset()}
    </React.Fragment>
  ),
};

export function JamClearedPage({ stateMachineState }: Props): JSX.Element {
  return (
    <CenteredCardPageLayout
      icon={<Icons.Done color="success" />}
      title={appStrings.titleBmdJamClearedScreen()}
      voterFacing
    >
      <P>
        {STATUS_MESSAGES[stateMachineState]}
        <br />
        {appStrings.noteBmdSessionRestart()}
      </P>
    </CenteredCardPageLayout>
  );
}
