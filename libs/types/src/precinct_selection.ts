import { z } from 'zod';
import { Precinct, PrecinctId, PrecinctIdSchema } from './election';

export type PrecinctSelectionKind = 'SinglePrecinct' | 'AllPrecincts';
export const PrecinctSelectionKindSchema: z.ZodSchema<PrecinctSelectionKind> =
  z.union([z.literal('SinglePrecinct'), z.literal('AllPrecincts')]);

export interface SinglePrecinctSelection {
  kind: 'SinglePrecinct';
  precinctId: PrecinctId;
}
export const SinglePrecinctSelectionSchema: z.ZodSchema<SinglePrecinctSelection> =
  z.object({
    kind: z.literal('SinglePrecinct'),
    precinctId: PrecinctIdSchema,
  });

export interface AllPrecinctsSelection {
  kind: 'AllPrecincts';
}
export const AllPrecinctsSelectionSchema: z.ZodSchema<AllPrecinctsSelection> =
  z.object({
    kind: z.literal('AllPrecincts'),
  });

export type PrecinctSelection = SinglePrecinctSelection | AllPrecinctsSelection;

export const PrecinctSelectionSchema: z.ZodSchema<PrecinctSelection> = z.union([
  SinglePrecinctSelectionSchema,
  AllPrecinctsSelectionSchema,
]);

export function getSinglePrecinctSelection(
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
