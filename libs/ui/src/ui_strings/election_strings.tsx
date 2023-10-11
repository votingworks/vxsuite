import React from 'react';

import {
  Candidate,
  Parties,
  Party,
  getCandidateParties,
} from '@votingworks/types';

import { UiString } from './ui_string';

/* istanbul ignore next - mostly presentational, tested via apps where relevant */
export const electionStrings = {
  // TODO(kofi): Fill out.

  // NOTE: Using more lenient typing to support both the `Contest` and the
  // `MsEitherNeitherContest` types.
  contestTitle: (contest: { id: string; title: string }) => (
    <UiString uiStringKey="contestTitle" uiStringSubKey={contest.id}>
      {contest.title}
    </UiString>
  ),

  partyName: (party: Party) => (
    <UiString uiStringKey="partyName" uiStringSubKey={party.id}>
      {party.name}
    </UiString>
  ),
} as const;

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
