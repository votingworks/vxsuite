import {
  Election,
  ElectionDefinition,
  PrecinctSelection,
  getDisplayElectionHash,
  getPrecinctById,
} from '@votingworks/types';
import React from 'react';
import { assert } from '@votingworks/basics';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';

export interface ConfigurationSectionProps {
  electionDefinition?: ElectionDefinition;
  expectPrecinctSelection?: boolean;
  precinctSelection?: PrecinctSelection;
}

function getPrecinctSelectionName(
  precinctSelection: PrecinctSelection,
  election: Election
): string {
  if (precinctSelection.kind === 'AllPrecincts') {
    return 'All Precincts';
  }

  const { precinctId } = precinctSelection;
  const precinct = getPrecinctById({ election, precinctId });
  assert(precinct);
  return precinct.name;
}

function getBallotStyleIds(
  election: Election,
  precinctSelection?: PrecinctSelection
): string[] {
  if (!precinctSelection || precinctSelection.kind === 'AllPrecincts') {
    return election.ballotStyles.map((bs) => bs.id);
  }

  const { precinctId } = precinctSelection;
  return election.ballotStyles
    .filter((bs) => bs.precincts.includes(precinctId))
    .map((bs) => bs.id);
}

export function ConfigurationSection({
  electionDefinition,
  expectPrecinctSelection,
  precinctSelection,
}: ConfigurationSectionProps): JSX.Element {
  if (!electionDefinition) {
    return (
      <React.Fragment>
        <H2>Configuration</H2>
        <P>
          <InfoIcon /> No election currently loaded on device.
        </P>
      </React.Fragment>
    );
  }
  const { election } = electionDefinition;

  return (
    <React.Fragment>
      <H2>Configuration</H2>
      <P>
        <SuccessIcon /> Election: {election.title},{' '}
        {getDisplayElectionHash(electionDefinition)}
      </P>
      {expectPrecinctSelection &&
        (precinctSelection ? (
          <P>
            <SuccessIcon /> Precinct:{' '}
            {getPrecinctSelectionName(precinctSelection, election)}
          </P>
        ) : (
          <P>
            <WarningIcon /> No precinct selected.
          </P>
        ))}
      {!(expectPrecinctSelection && !precinctSelection) && (
        <P>
          <SuccessIcon /> Ballot Styles:{' '}
          {getBallotStyleIds(election, precinctSelection).join(', ')}
        </P>
      )}
    </React.Fragment>
  );
}
