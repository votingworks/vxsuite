import React, { useEffect } from 'react';

import { Main, Screen, Prose, RotateCardImage, H1, P } from '@votingworks/ui';
import { triggerAudioFocus } from '../utils/trigger_audio_focus';

export function CardErrorScreen(): JSX.Element {
  useEffect(triggerAudioFocus, []);

  return (
    <Screen white>
      <Main centerChild>
        <div>
          <RotateCardImage />
          <Prose textCenter id="audiofocus">
            <H1>Card is Backwards</H1>
            <P>Remove the card, turn it around, and insert it again.</P>
          </Prose>
        </div>
      </Main>
    </Screen>
  );
}
