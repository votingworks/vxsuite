import React, { useEffect } from 'react';
import styled from 'styled-components';

import { Main, MainChild } from '@votingworks/ui';

import { Prose } from '../components/prose';
import { Screen } from '../components/screen';
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
      <Main>
        <MainChild center>
          <RotateCardImage
            aria-hidden
            src="/images/rotate-card.svg"
            alt="rotate-card"
          />
          <Prose textCenter id="audiofocus">
            <h1>Card is backwards</h1>
            <p>Remove the card, turn it around, and insert it again.</p>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  );
}
