import {
  AllPrecinctsSelection,
  Precinct,
  PrecinctId,
  PrecinctSelection,
  SinglePrecinctSelection,
} from '@votingworks/types';

export function singlePrecinctSelectionFor(
  precinctId: PrecinctId
): SinglePrecinctSelection {
  return {
    kind: 'SinglePrecinct',
    precinctId,
  };
}

export const ALL_PRECINCTS_SELECTION: AllPrecinctsSelection = {
  kind: 'AllPrecincts',
};

export const ALL_PRECINCTS_NAME = 'All Precincts';

export function getPrecinctSelectionName(
  precincts: readonly Precinct[],
  precinctSelection: PrecinctSelection
): string {
  if (precinctSelection.kind === 'AllPrecincts') {
    return ALL_PRECINCTS_NAME;
  }

  const precinct = precincts.find((p) => p.id === precinctSelection.precinctId);

  if (!precinct) {
    throw Error(
      `precinct with ID ${precinctSelection.precinctId} was not found in election`
    );
  }

  return precinct.name;
}
