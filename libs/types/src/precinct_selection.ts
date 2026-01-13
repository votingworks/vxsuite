import { z } from 'zod/v4';
import { PrecinctId, PrecinctIdSchema } from './election';

export const PrecinctSelectionKindSchema = z.union([
  z.literal('SinglePrecinct'),
  z.literal('AllPrecincts'),
]);

export type PrecinctSelectionKind = z.infer<
  typeof PrecinctSelectionKindSchema
>;

export const SinglePrecinctSelectionSchema = z.object({
  kind: z.literal('SinglePrecinct'),
  precinctId: PrecinctIdSchema,
});

export interface SinglePrecinctSelection
  extends z.infer<typeof SinglePrecinctSelectionSchema> {}

export const AllPrecinctsSelectionSchema = z.object({
  kind: z.literal('AllPrecincts'),
});

export interface AllPrecinctsSelection
  extends z.infer<typeof AllPrecinctsSelectionSchema> {}

export const PrecinctSelectionSchema = z.union([
  SinglePrecinctSelectionSchema,
  AllPrecinctsSelectionSchema,
]);

export type PrecinctSelection = z.infer<typeof PrecinctSelectionSchema>;
