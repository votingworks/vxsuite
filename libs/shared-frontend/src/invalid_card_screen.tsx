import React from 'react';
import styled from 'styled-components';
import { DippedSmartcardAuth, InsertedSmartcardAuth } from '@votingworks/types';

import { fontSizeTheme } from './themes';
import { Main } from './main';
import { Prose } from './prose';
import { Screen } from './screen';

const RotateCardImage = styled.img`
  margin-bottom: 1rem;
  width: 300px;
`;

type LoggedOutReason =
  | DippedSmartcardAuth.LoggedOut['reason']
  | InsertedSmartcardAuth.LoggedOut['reason'];

export interface Props {
  reason: LoggedOutReason;
  recommendedAction?: string;
}

export function InvalidCardScreen({
  reason,
  recommendedAction: recommendedActionOverride,
}: Props): JSX.Element {
  let graphic: JSX.Element | null = null;
  let heading = 'Invalid Card';
  let errorDescription = '';
  let recommendedAction =
    'Please insert a valid Election Manager or System Administrator card.';

  if (reason === 'card_error') {
    graphic = (
      <RotateCardImage
        alt="" // Technically a decorative image given other text on the page
        src="/assets/rotate-card.svg"
      />
    );
    // The only cause we currently know of for a card error
    heading = 'Card is Backwards';
    recommendedAction = 'Remove the card, turn it around, and insert it again.';
  }

  if (reason === 'election_manager_wrong_election') {
    errorDescription =
      'The inserted Election Manager card is programmed for another election ' +
      'and cannot be used to unlock this machine.';
  }

  if (reason === 'machine_not_configured') {
    errorDescription =
      'This machine is unconfigured and cannot be unlocked with this card.';
  }

  return (
    <Screen white>
      <Main centerChild padded>
        {graphic}
        <Prose textCenter themeDeprecated={fontSizeTheme.medium}>
          <h1>{heading}</h1>
          <p>
            {errorDescription} {recommendedActionOverride || recommendedAction}
          </p>
        </Prose>
      </Main>
    </Screen>
  );
}
