/**
 * Default port for the server.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.PORT || 3002);
export const WORKSPACE =
  process.env.BALLOT_ON_DEMAND_WORKSPACE || 'dev-workspace';
