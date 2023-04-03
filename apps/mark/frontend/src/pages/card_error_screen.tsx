import React, { useEffect } from 'react';

import { Main, Screen, Prose, RotateCardImage } from '@votingworks/ui';
import { triggerAudioFocus } from '../utils/trigger_audio_focus';

interface Props {
  useEffectToggleLargeDisplay: () => void;
}

export function CardErrorScreen({
  useEffectToggleLargeDisplay,
}: Props): JSX.Element {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(useEffectToggleLargeDisplay, []);
  useEffect(triggerAudioFocus, []);

  return (
    <Screen white>
      <Main centerChild>
        <div>
          <RotateCardImage />
          <Prose textCenter id="audiofocus">
            <h1>Card is Backwards</h1>
            <p>Remove the card, turn it around, and insert it again.</p>
          </Prose>
        </div>
      </Main>
    </Screen>
  );
}
