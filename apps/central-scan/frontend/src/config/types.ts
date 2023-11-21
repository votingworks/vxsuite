import { MachineId } from '@votingworks/types';
import { z } from 'zod';

export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}
export const MachineConfigSchema: z.ZodSchema<MachineConfig> = z.object({
  machineId: MachineId,
  codeVersion: z.string().nonempty(),
});

export type MachineConfigResponse = MachineConfig;
export const MachineConfigResponseSchema = MachineConfigSchema;
