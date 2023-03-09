/* stylelint-disable order/properties-order, value-keyword-case, order/order */
import React from 'react';
import styled from 'styled-components';
import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';

import { Main } from './main';
import { Screen } from './screen';
import { RotateCardImage } from './rotate_card_image';
import { Section } from './section';
import { Caption, Font, H1 } from './typography';
import { Icons } from './icons';

type LoggedOutReason =
  | DippedSmartCardAuth.LoggedOut['reason']
  | InsertedSmartCardAuth.LoggedOut['reason'];

export interface Props {
  reason: LoggedOutReason;
  recommendedAction?: string;
}

const StyledErrorIconContainer = styled(Font)`
  font-size: 250px;
  margin-bottom: 0.1em;
`;

const DEFAULT_ERROR_ICON = (
  <StyledErrorIconContainer color="danger">
    <Icons.DangerX />
  </StyledErrorIconContainer>
);

export function InvalidCardScreen({
  reason,
  recommendedAction: recommendedActionOverride,
}: Props): JSX.Element {
  let graphic = DEFAULT_ERROR_ICON;
  let heading = 'Invalid Card';
  let errorDescription = '';
  let recommendedAction =
    'Please insert a valid Election Manager or System Administrator card.';

  if (reason === 'card_error') {
    graphic = <RotateCardImage />;
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
        <Section horizontalAlign="center">
          <H1>{heading}</H1>
          <Caption>
            {errorDescription} {recommendedActionOverride || recommendedAction}
          </Caption>
        </Section>
      </Main>
    </Screen>
  );
}
