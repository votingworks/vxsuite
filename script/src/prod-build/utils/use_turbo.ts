/**
 * Whether to orchestrate builds with Turborepo. Turbo is the default; set
 * `VX_USE_TURBO` to a falsy value (`0`, `false`, `no` or `off`) to opt out and
 * use the pre-Turbo pnpm scripts. Mirrors `script/lib/turbo.sh`.
 */
export function useTurbo(): boolean {
  const value = process.env['VX_USE_TURBO'];
  if (value === undefined || value === '') {
    return true;
  }
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}
