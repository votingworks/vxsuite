export interface ServerResult {
  machine_id: string;
  precinct_id: string;
  seconds_since_epoch: number;
  tally: number[][];
}
