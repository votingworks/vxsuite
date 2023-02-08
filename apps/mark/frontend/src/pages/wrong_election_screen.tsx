import React, { useEffect } from 'react';

import { Main, Screen, Prose } from '@votingworks/ui';

import { triggerAudioFocus } from '../utils/trigger_audio_focus';

interface Props {
  useEffectToggleLargeDisplay: () => void;
  isVoterCard: boolean;
}

export function WrongElectionScreen({
  useEffectToggleLargeDisplay,
  isVoterCard,
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
          <p>
            Please ask {isVoterCard ? 'poll worker' : 'admin'} for assistance.
          </p>
        </Prose>
      </Main>
    </Screen>
  );
}
