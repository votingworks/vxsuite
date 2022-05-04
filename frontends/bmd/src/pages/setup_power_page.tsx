import React, { useEffect } from 'react';

import { Main, MainChild, Screen } from '@votingworks/ui';

import { Prose } from '../components/prose';
import { NoWrap } from '../components/text';

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
      <Main padded>
        <MainChild center>
          <Prose textCenter>
            <h1>
              No Power Detected <NoWrap>and Battery is Low</NoWrap>
            </h1>
            <p>
              Please ask a poll worker to plug-in the power cord for this
              machine.
            </p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
}
