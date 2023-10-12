import {
  AllPrecinctsSelection,
  Precinct,
  PrecinctId,
  PrecinctSelection,
  SinglePrecinctSelection,
} from '@votingworks/types';
import { find } from '@votingworks/basics';

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

export function getPrecinctSelection(
  precincts: readonly Precinct[],
  precinctSelection: SinglePrecinctSelection
): Precinct {
  return find(precincts, (p) => p.id === precinctSelection.precinctId);
}

export function getPrecinctSelectionName(
  precincts: readonly Precinct[],
  precinctSelection: PrecinctSelection
): string {
  if (precinctSelection.kind === 'AllPrecincts') {
    return ALL_PRECINCTS_NAME;
  }

  return getPrecinctSelection(precincts, precinctSelection).name;
}

export function areEqualPrecinctSelections(
  precinctSelectionOne: PrecinctSelection,
  precinctSelectionTwo: PrecinctSelection
): boolean {
  if (precinctSelectionOne.kind === 'AllPrecincts') {
    return precinctSelectionTwo.kind === 'AllPrecincts';
  }

  if (precinctSelectionTwo.kind === 'AllPrecincts') {
    return false;
  }

  return precinctSelectionOne.precinctId === precinctSelectionTwo.precinctId;
}
