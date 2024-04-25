import { Icons, P } from '@votingworks/ui';
import type { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import React from 'react';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

const JAM_CLEARED_STATES = [
  'jam_cleared',
  'resetting_state_machine_after_jam',
] as const satisfies readonly SimpleServerStatus[];

export type JamClearedState = (typeof JAM_CLEARED_STATES)[number];

interface ReplaceJammedSheetScreenProps {
  stateMachineState: JamClearedState;
}

const STATUS_MESSAGES: Readonly<Record<JamClearedState, JSX.Element>> = {
  jam_cleared: (
    <P>
      <Icons.Loading /> Please wait while the hardware is reset...
    </P>
  ),
  resetting_state_machine_after_jam: (
    <React.Fragment>
      <P>
        <Icons.Done color="success" /> The hardware has been reset.
      </P>
      <P>Please load a new sheet to resume the voter session.</P>
    </React.Fragment>
  ),
};

export function ReplaceJammedSheetScreen(
  props: ReplaceJammedSheetScreenProps
): JSX.Element {
  const { stateMachineState } = props;

  return (
    <CenteredCardPageLayout
      icon={<Icons.Info />}
      title="Jam Cleared"
      voterFacing={false}
    >
      {STATUS_MESSAGES[stateMachineState]}
    </CenteredCardPageLayout>
  );
}
