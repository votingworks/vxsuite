/* istanbul ignore file - will eventually be tested via consumers. */
import { z } from 'zod/v4';

export type MachineVersion = 'latest';

export const ElectionPackageMetadataSchema = z.object({
  version: z.literal('latest'),
});

export interface ElectionPackageMetadata
  extends z.infer<typeof ElectionPackageMetadataSchema> {}

export const LATEST_METADATA: ElectionPackageMetadata = {
  version: 'latest',
};
