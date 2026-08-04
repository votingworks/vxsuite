import React from 'react';
import { assertDefined } from '@votingworks/basics';
import { PartySelectionPage } from '@votingworks/mark-flow-ui';
import { BallotContext } from '../contexts/ballot_context.js';

export function PartySelectionScreen(): JSX.Element {
  const { electionDefinition, selectParty, selectedPartyId, votes } =
    React.useContext(BallotContext);
  const { election } = assertDefined(electionDefinition);

  return (
    <PartySelectionPage
      election={election}
      selectedPartyId={selectedPartyId}
      selectParty={selectParty}
      votes={votes}
      startPageUrl="/"
      contestsPageUrl="/contests/0"
      reviewPageUrl="/review"
    />
  );
}
