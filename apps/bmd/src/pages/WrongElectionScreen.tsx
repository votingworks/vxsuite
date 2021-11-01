import React, { useEffect } from 'react';

import { Main, MainChild } from '@votingworks/ui';

import { Prose } from '../components/Prose';
import { Screen } from '../components/Screen';
import { triggerAudioFocus } from '../utils/triggerAudioFocus';

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
      <Main>
        <MainChild center>
          <Prose textCenter id="audiofocus">
            <h1>Invalid Card Data</h1>
            <p>Card is not configured for this election.</p>
            <p>
              Please ask {isVoterCard ? 'poll worker' : 'admin'} for assistance.
            </p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
}
