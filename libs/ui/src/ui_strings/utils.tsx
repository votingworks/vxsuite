import React from 'react';

import { Candidate, Parties, getCandidateParties } from '@votingworks/types';

import { electionStrings } from './election_strings';

/**
 * Convenience function for rendering a translated list of parties associated
 * with a given candidate, along with the relevant audio.
 */
export function renderCandidatePartyList(
  candidate: Candidate,
  electionParties: Parties
): JSX.Element {
  return (
    <React.Fragment>
      {getCandidateParties(electionParties, candidate).map((party, i) => (
        <React.Fragment key={party.id}>
          {/*
           * TODO(kofi): This comma-delimiting isn't properly
           * internationalized (comma character is rendered differently in
           * different languages/character sets) -- need to figure out a clean
           * way to do this.
           */}
          {i > 0 && <React.Fragment>, </React.Fragment>}
          {electionStrings.partyName(party)}
        </React.Fragment>
      ))}
    </React.Fragment>
  );
}
