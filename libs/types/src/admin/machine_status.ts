/** Status of a machine in the multi-station machines table. */
export enum ClientMachineStatus {
  Offline = 'offline',
  OnlineLocked = 'online_locked',
  Active = 'active',
  Adjudicating = 'adjudicating',
}
