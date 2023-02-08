import { ElectionDefinition, MachineId } from '@votingworks/types';
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

// Events
export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void;

// Election
export type SetElectionDefinition = (value: ElectionDefinition) => void;
