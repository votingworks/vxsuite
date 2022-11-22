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

export type TextSizeSetting = 'S' | 'M' | 'L' | 'XL';
export type ContrastSetting = 'black' | 'white' | 'grey';

export interface UserSettings {
  sizeTheme: TextSizeSetting;
  contrastTheme: ContrastSetting;
}
export type SetUserSettings = (partial: PartialUserSettings) => void;
export type PartialUserSettings = Partial<UserSettings>;

export type MachineConfigResponse = MachineConfig;
export const MachineConfigResponseSchema = MachineConfigSchema;
