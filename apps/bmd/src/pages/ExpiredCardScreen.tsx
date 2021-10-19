import React, { useEffect } from 'react';

import { Main, MainChild } from '@votingworks/ui';

import Prose from '../components/Prose';
import Screen from '../components/Screen';
import triggerAudioFocus from '../utils/triggerAudioFocus';

interface Props {
  useEffectToggleLargeDisplay: () => void;
}

const ExpiredCardScreen = ({
  useEffectToggleLargeDisplay,
}: Props): JSX.Element => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(useEffectToggleLargeDisplay, []);
  useEffect(triggerAudioFocus, []);

  return (
    <Screen white>
      <Main>
        <MainChild center>
          <Prose textCenter id="audiofocus">
            <h1>Expired Card</h1>
            <p>Please ask poll worker for assistance.</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
};

export default ExpiredCardScreen;
