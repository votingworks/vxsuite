/* istanbul ignore file - will eventually be tested via consumers. */
import { z } from 'zod';

export interface BallotPackageMetadata {
  version: string;
}

export const BallotPackageMetadataSchema: z.ZodType<BallotPackageMetadata> =
  z.object({
    version: z.string(),
  });
