import React, { useEffect } from 'react';

import { Main, Screen, Prose } from '@votingworks/shared-frontend';

import { triggerAudioFocus } from '../utils/trigger_audio_focus';

interface Props {
  useEffectToggleLargeDisplay: () => void;
}

export function WrongElectionScreen({
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
          <p>Card is not configured for this election.</p>
          <p>Please ask admin for assistance.</p>
        </Prose>
      </Main>
    </Screen>
  );
}
