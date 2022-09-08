import { z } from 'zod';
import { PrecinctId, PrecinctIdSchema } from './election';

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
