import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { assert, assertDefined } from '@votingworks/basics';
import {
  ballotTemplates,
  createBallotPropsForTemplate,
} from '@votingworks/hmpb';
import { LanguageCode } from '@votingworks/types';
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
    modes: { type: 'string', default: 'official,test' },
    'english-only': { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});
if (!values.election || !isElectionPresetName(values.election) || !values.out) {
  throw new Error(
    `Usage: node rust_jobs.ts --election <${Object.keys(ELECTION_PRESETS).join('|')}> --out <dir> [--precincts <n>] [--modes official,test] [--english-only]`
  );
}
const presetSpec = scaleSpec(
  ELECTION_PRESETS[values.election],
  values.precincts ? Number(values.precincts) : undefined
);
const { election, candidateOrderings, spec } = generateElection(
  values['english-only']
    ? {
        ...presetSpec,
        name: `${presetSpec.name}-english`,
        languageConfigs: [[LanguageCode.ENGLISH]],
      }
    : presetSpec
);
assert(
  spec.languageConfigs.every(
    (languages) =>
      languages.length === 1 && languages[0] === LanguageCode.ENGLISH
  ),
  'The Rust prototype only renders English ballots; pass --english-only to drop the other languages'
);
const modes = values.modes.split(',');
const props = createBallotPropsForTemplate(
  'VxDefaultBallot',
  election,
  false
).filter(({ ballotMode }) => modes.includes(ballotMode));
const jobs = props.map((p, index) => ({
  index,
  styleId: p.ballotStyle.id,
  precinctId: p.precinctId,
  ballotType: p.ballotType,
  ballotMode: p.ballotMode,
  contests: ballotTemplates.VxDefaultBallot.contestsForBallot(
    assertDefined(candidateOrderings.get(p.ballotStyle.groupId)),
    p
  ),
}));
mkdirSync(values.out, { recursive: true });
writeFileSync(
  join(values.out, 'election.parsed.json'),
  JSON.stringify(election)
);
writeFileSync(join(values.out, 'jobs.json'), JSON.stringify(jobs));
writeFileSync(join(values.out, 'ballot_hash.txt'), 'a'.repeat(64));
console.log(
  `${spec.name}: ${election.ballotStyles.length} ballot styles, ${jobs.length} ballots written to ${values.out}`
);
