import React from 'react';

import { Main, Screen, CenteredLargeProse, H1, P } from '@votingworks/ui';

/**
 * LoginPromptScreen prompts the user to log in when the machine is unconfigured
 * @returns JSX.Element
 */
export function LoginPromptScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <CenteredLargeProse>
          <H1>VxScan is Not Configured</H1>
          <P>Insert Election Manager card to load an election definition.</P>
        </CenteredLargeProse>
      </Main>
    </Screen>
  );
}
