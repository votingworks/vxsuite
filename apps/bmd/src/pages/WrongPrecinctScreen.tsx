import React, { useEffect } from 'react';

import { Main, MainChild } from '@votingworks/ui';

import { Prose } from '../components/Prose';
import { Screen } from '../components/Screen';
import { triggerAudioFocus } from '../utils/triggerAudioFocus';

interface Props {
  useEffectToggleLargeDisplay: () => void;
}

export function WrongPrecinctScreen({
  useEffectToggleLargeDisplay,
}: Props): JSX.Element {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(useEffectToggleLargeDisplay, []);
  useEffect(triggerAudioFocus, []);

  return (
    <Screen white>
      <Main>
        <MainChild center>
          <Prose textCenter id="audiofocus">
            <h1>Invalid Card Data</h1>
            <p>Card is not configured for this precinct.</p>
            <p>Please ask poll worker for assistance.</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
}
