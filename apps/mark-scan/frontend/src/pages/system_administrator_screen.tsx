import React from 'react';

import { BaseLogger } from '@votingworks/logging';
import {
  H3,
  Main,
  Screen,
  SystemAdministratorScreenContents,
} from '@votingworks/ui';
import { logOut } from '../api';

const resetPollsToPausedText =
  'The polls are closed and voting is complete. After resetting the polls to paused, it will be possible to re-open the polls and resume voting. The printed ballots count will be preserved.';

interface Props {
  logger: BaseLogger;
  unconfigureMachine: () => Promise<void>;
  isMachineConfigured: boolean;
  resetPollsToPaused?: () => Promise<void>;
}

/**
 * Screen when a system administrator card is inserted
 */
export function SystemAdministratorScreen({
  logger,
  unconfigureMachine,
  isMachineConfigured,
  resetPollsToPaused,
}: Props): JSX.Element {
  const logOutMutation = logOut.useMutation();
  return (
    <Screen>
      <Main padded>
        <H3 as="h1">System Administrator</H3>
        <SystemAdministratorScreenContents
          displayRemoveCardToLeavePrompt
          logger={logger}
          resetPollsToPausedText={resetPollsToPausedText}
          resetPollsToPaused={resetPollsToPaused}
          primaryText={
            <React.Fragment>
              To adjust settings for the current election,
              <br />
              please insert an Election Manager or Poll Worker card.
            </React.Fragment>
          }
          unconfigureMachine={unconfigureMachine}
          isMachineConfigured={isMachineConfigured}
          logOut={() => logOutMutation.mutate()}
        />
      </Main>
    </Screen>
  );
}
