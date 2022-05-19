import React, { useEffect } from 'react';

import { Main, NoWrap, Screen, Prose } from '@votingworks/ui';

interface Props {
  useEffectToggleLargeDisplay: () => void;
}

export function SetupPowerPage({
  useEffectToggleLargeDisplay,
}: Props): JSX.Element {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(useEffectToggleLargeDisplay, []);

  return (
    <Screen white>
      <Main padded centerChild>
        <Prose textCenter>
          <h1>
            No Power Detected <NoWrap>and Battery is Low</NoWrap>
          </h1>
          <p>
            Please ask a poll worker to plug-in the power cord for this machine.
          </p>
        </Prose>
      </Main>
    </Screen>
  );
}
