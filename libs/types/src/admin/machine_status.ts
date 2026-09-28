import type { EnumValues } from '@votingworks/basics';

/** Status of a machine in the multi-station machines table. */
export const ClientMachineStatus = {
  Offline: 'offline',
  OnlineLocked: 'online_locked',
  Active: 'active',
  Adjudicating: 'adjudicating',
} as const;

/** Status of a machine in the multi-station machines table. */
export type ClientMachineStatus = EnumValues<typeof ClientMachineStatus>;
