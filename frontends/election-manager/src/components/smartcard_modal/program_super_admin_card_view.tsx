import React from 'react';
import { Button } from '@votingworks/ui';
import { CardProgramming } from '@votingworks/types';

interface Props {
  card: CardProgramming;
}

export function ProgramSuperAdminCardView({ card }: Props): JSX.Element {
  return (
    <React.Fragment>
      <h2>Program Super Admin Card</h2>
      <Button onPress={() => card.programUser({ role: 'superadmin' })}>
        Program
      </Button>
    </React.Fragment>
  );
}
