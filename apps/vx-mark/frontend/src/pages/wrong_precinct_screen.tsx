import React, { useEffect } from 'react';

import { Main, Screen, Prose } from '@votingworks/ui';
import { triggerAudioFocus } from '../utils/trigger_audio_focus';

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
      <Main centerChild>
        <Prose textCenter id="audiofocus">
          <h1>Invalid Card Data</h1>
          <p>Card is not configured for this precinct.</p>
          <p>Please ask poll worker for assistance.</p>
        </Prose>
      </Main>
    </Screen>
  );
}
