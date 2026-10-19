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

export const BallotStyleQrCodeSchema: z.ZodSchema<BallotStyleQrCode> = z.object(
  {
    ballotStyleId: BallotStyleIdSchema,
    precinctId: PrecinctIdSchema.optional(),
  }
);

export function parseBallotStyleQrCode(
  text: string
): Result<BallotStyleQrCode, z.ZodError | SyntaxError> {
  return safeParseJson(text, BallotStyleQrCodeSchema);
}
