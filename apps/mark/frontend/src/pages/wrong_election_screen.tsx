import React, { useEffect } from 'react';

import { Main, Screen, Prose, H1, P } from '@votingworks/ui';

import { triggerAudioFocus } from '../utils/trigger_audio_focus';

export function WrongElectionScreen(): JSX.Element {
  useEffect(triggerAudioFocus, []);

  return (
    <Screen white>
      <Main centerChild>
        <Prose textCenter id="audiofocus">
          <H1>Invalid Card Data</H1>
          <P>Card is not configured for this election.</P>
          <P>Please ask admin for assistance.</P>
        </Prose>
      </Main>
    </Screen>
  );
}
