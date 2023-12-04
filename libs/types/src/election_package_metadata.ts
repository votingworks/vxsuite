/* istanbul ignore file - will eventually be tested via consumers. */
import { z } from 'zod';

export interface ElectionPackageMetadata {
  version: string;
}

export const ElectionPackageMetadataSchema: z.ZodType<ElectionPackageMetadata> =
  z.object({
    version: z.string(),
  });
