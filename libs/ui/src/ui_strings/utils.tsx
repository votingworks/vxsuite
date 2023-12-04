import React from 'react';

import {
  BallotStyleId,
  Candidate,
  Election,
  Parties,
  Precinct,
  PrecinctSelection,
  getCandidateParties,
  getPartyForBallotStyle,
} from '@votingworks/types';
import { getPrecinctSelection } from '@votingworks/utils';

import { appStrings } from './app_strings';
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

export function PrecinctSelectionName(props: {
  electionPrecincts: readonly Precinct[];
  precinctSelection?: PrecinctSelection;
}): React.ReactNode {
  const { electionPrecincts, precinctSelection } = props;

  if (!precinctSelection) {
    return null;
  }

  if (precinctSelection.kind === 'AllPrecincts') {
    return appStrings.labelAllPrecinctsSelection();
  }

  const precinct = getPrecinctSelection(electionPrecincts, precinctSelection);

  return electionStrings.precinctName(precinct);
}

export function PrimaryElectionTitlePrefix(props: {
  ballotStyleId: BallotStyleId;
  election: Election;
}): React.ReactNode {
  const { ballotStyleId, election } = props;
  const party = getPartyForBallotStyle({ ballotStyleId, election });
  if (!party) {
    return null;
  }

  return (
    <React.Fragment>{electionStrings.partyFullName(party)} </React.Fragment>
  );
}
