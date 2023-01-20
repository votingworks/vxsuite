import React, { useEffect } from 'react';

import { Main, Screen, Prose } from '@votingworks/ui';

import { triggerAudioFocus } from '../utils/trigger_audio_focus';

interface Props {
  useEffectToggleLargeDisplay: () => void;
}

export function UsedCardScreen({
  useEffectToggleLargeDisplay,
}: Props): JSX.Element {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(useEffectToggleLargeDisplay, []);
  useEffect(triggerAudioFocus, []);

  return (
    <Screen white>
      <Main centerChild>
        <Prose textCenter id="audiofocus">
          <h1>Used Card</h1>
          <p>Please return card to a poll worker.</p>
        </Prose>
      </Main>
    </Screen>
  );
}
