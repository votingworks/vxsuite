import React, { useContext } from 'react';
import { Button } from '@votingworks/ui';
import { CardProgramming } from '@votingworks/types';

import { AppContext } from '../../contexts/app_context';

interface Props {
  card: CardProgramming;
}

export function ProgramElectionCardView({ card }: Props): JSX.Element {
  const { electionDefinition } = useContext(AppContext);

  return (
    <React.Fragment>
      <h2>Program Election Card</h2>
      <Button
        disabled={!electionDefinition}
        onPress={() =>
          card.programUser({
            role: 'admin',
            electionHash: electionDefinition?.electionHash || '',
            passcode: '000000',
            electionData: electionDefinition?.electionData || '',
          })
        }
      >
        Program
      </Button>
      {!electionDefinition && (
        <p>
          An election must be defined before Admin and Poll Worker cards can be
          programmed.
        </p>
      )}
    </React.Fragment>
  );
}
