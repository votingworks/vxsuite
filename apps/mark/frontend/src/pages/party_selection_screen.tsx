import React from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { assertDefined } from '@votingworks/basics';
import { Button, H1, P } from '@votingworks/ui';
import { VoterScreen } from '@votingworks/mark-flow-ui';
import { BallotContext } from '../contexts/ballot_context';

const PartyList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 30rem;
  margin: 0 auto;
`;

export function PartySelectionScreen(): JSX.Element {
  const history = useHistory();
  const { electionDefinition, selectParty, selectedPartyId } =
    React.useContext(BallotContext);
  const { election } = assertDefined(electionDefinition);

  function onSelectParty(partyId: string) {
    selectParty(partyId);
    history.push('/contests/0');
  }

  return (
    <VoterScreen>
      <H1>Choose Your Party</H1>
      <P>
        This is an open primary election. Please select which party&apos;s
        contests you would like to vote in. You will also be able to vote in all
        nonpartisan contests.
      </P>
      <PartyList>
        {election.parties.map((party) => (
          <Button
            key={party.id}
            onPress={() => onSelectParty(party.id)}
            variant={selectedPartyId === party.id ? 'primary' : 'neutral'}
          >
            {party.fullName}
          </Button>
        ))}
      </PartyList>
    </VoterScreen>
  );
}
