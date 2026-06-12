import React from 'react';

import {
  Candidate,
  Election,
  Parties,
  getCandidateParties,
  pollingPlaceFromElection,
} from '@votingworks/types';

import { electionStrings } from './election_strings';

/**
 * Convenience component for rendering a translated list of parties associated
 * with a given candidate, along with the relevant audio.
 */
export function CandidatePartyList(props: {
  candidate: Candidate;
  electionParties: Parties;
}): JSX.Element {
  const { candidate, electionParties } = props;

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

export function PollingPlaceName(props: {
  election: Election;
  id?: string;
}): React.ReactNode {
  const { election, id } = props;

  if (!id) return null;

  return electionStrings.pollingPlaceName(
    pollingPlaceFromElection(election, id)
  );
}
