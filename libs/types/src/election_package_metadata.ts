/* istanbul ignore file - will eventually be tested via consumers. */
import { z } from 'zod';

export type MachineVersion = 'latest';

export interface ElectionPackageMetadata {
  version: MachineVersion;
}

export const ElectionPackageMetadataSchema: z.ZodType<ElectionPackageMetadata> =
  z.object({
    version: z.literal('latest'),
  });

export const LATEST_METADATA: ElectionPackageMetadata = {
  version: 'latest',
};
