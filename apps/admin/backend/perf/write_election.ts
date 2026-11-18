import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { generateElection } from './generate_election.ts';
import {
  ELECTION_PRESETS,
  isElectionPresetName,
  scaleSpec,
} from './presets.ts';

const { values } = parseArgs({
  options: {
    election: { type: 'string' },
    precincts: { type: 'string' },
    out: { type: 'string' },
  },
});
if (!values.election || !isElectionPresetName(values.election)) {
  throw new Error(
    `Usage: node write_election.ts --election <${Object.keys(ELECTION_PRESETS).join('|')}> [--precincts <n>] [--out <election.json>]`
  );
}
const { election, stats } = generateElection(
  scaleSpec(
    ELECTION_PRESETS[values.election],
    values.precincts ? Number(values.precincts) : undefined
  )
);
console.log(JSON.stringify(stats, null, 2));
if (values.out) {
  writeFileSync(values.out, JSON.stringify(election, null, 2));
}
