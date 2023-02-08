import React from 'react';

import { Main, Screen, Prose } from '@votingworks/ui';

import styled from 'styled-components';

const Graphic = styled.img`
  margin: 0 auto -1rem;
  height: 30vw;
`;

export function RemoveCardScreen(): JSX.Element {
  return (
    <Screen white>
      <Main>
        <Prose textCenter id="audiofocus">
          <p>Your votes have been saved to the card.</p>
          <p>
            <Graphic
              aria-hidden
              src="/images/take-card-to-printer.svg"
              alt="Take Card to Printer"
            />
          </p>
          <h1 aria-label="Remove your card. Take card to the Ballot Printer to print your official ballot.">
            Take your card to the Ballot Printer.
          </h1>
        </Prose>
      </Main>
    </Screen>
  );
}
