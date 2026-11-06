import type { PrecinctId } from './election.js';

export type PrecinctSelectionKind = 'SinglePrecinct' | 'AllPrecincts';

export interface SinglePrecinctSelection {
  kind: 'SinglePrecinct';
  precinctId: PrecinctId;
}

export interface AllPrecinctsSelection {
  kind: 'AllPrecincts';
}

export type PrecinctSelection = SinglePrecinctSelection | AllPrecinctsSelection;
