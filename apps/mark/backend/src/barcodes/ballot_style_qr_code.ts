import type { Result } from '@votingworks/basics';
import {
  type BallotStyleId,
  BallotStyleIdSchema,
  type PrecinctId,
  PrecinctIdSchema,
  safeParseJson,
} from '@votingworks/types';
import { z } from 'zod/v4';

export interface BallotStyleQrCode {
  readonly ballotStyleId: BallotStyleId;
  readonly precinctId?: PrecinctId;
}

export const BallotStyleQrCodeSchema: z.ZodType<BallotStyleQrCode> = z
  .object({
    bId: BallotStyleIdSchema,
    pId: PrecinctIdSchema.optional(),
  })
  .transform(({ bId, pId }) => ({ ballotStyleId: bId, precinctId: pId }));

export function parseBallotStyleQrCode(
  text: string
): Result<BallotStyleQrCode, z.ZodError | SyntaxError> {
  return safeParseJson(text, BallotStyleQrCodeSchema);
}
