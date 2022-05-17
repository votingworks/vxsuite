import React, { useEffect } from 'react';
import styled from 'styled-components';

import { Main, Screen, Prose } from '@votingworks/ui';
import { triggerAudioFocus } from '../utils/trigger_audio_focus';

const RotateCardImage = styled.img`
  margin: 0 auto 1rem;
  width: 300px;
`;

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
          <RotateCardImage
            aria-hidden
            src="/images/rotate-card.svg"
            alt="rotate-card"
          />
          <Prose textCenter id="audiofocus">
            <h1>Card is Backwards</h1>
            <p>Remove the card, turn it around, and insert it again.</p>
          </Prose>
        </div>
      </Main>
    </Screen>
  );
}
