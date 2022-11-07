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

export type TextSizeSetting = 0 | 1 | 2 | 3;

export interface UserSettings {
  textSize: TextSizeSetting;
}
export type SetUserSettings = (partial: PartialUserSettings) => void;
export type PartialUserSettings = Partial<UserSettings>;

export type MachineConfigResponse = MachineConfig;
export const MachineConfigResponseSchema = MachineConfigSchema;
