import React from 'react';
import { Button } from '@votingworks/ui';
import { CardProgramming } from '@votingworks/types';

interface Props {
  card: CardProgramming;
}

export function CardDetailsView({ card }: Props): JSX.Element {
  return (
    <React.Fragment>
      <h2>Card Details</h2>
      <Button onPress={() => card.unprogramUser()}>Unprogram</Button>
    </React.Fragment>
  );
}
