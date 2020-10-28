export function getMachineId(): string {
  return process.env.VX_MACHINE_ID ?? '000'
}
