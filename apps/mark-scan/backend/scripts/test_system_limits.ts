/* eslint-disable no-console */
import {
  formatElectionPackageHash,
  safeParseInt,
  safeParseJson,
  safeParseNumber,
  VotesDict,
} from '@votingworks/types';
import { Command, InvalidOptionArgumentError } from 'commander';
import {
  generateElection,
  positiveInt,
  generateElectionPackage,
  DeepPartialGenerateElectionConfigSchema,
} from '@votingworks/fixture-generators';
import z from 'zod/v4';
import tmp from 'tmp';
import { readFileSync, writeFileSync } from 'node:fs';
import { readElectionPackageFromFile } from '@votingworks/backend';
import path from 'node:path';
import { assertDefined } from '@votingworks/basics';
import { DateTime } from 'luxon';
import { renderTestModeBallotWithoutLanguageContext } from '../src/util/render_ballot';

enum PaperLength {
  Regular = 11,
  Long = 13.25,
}

const program = new Command();

function parseIntStrict(value: string, paramName: string): number {
  const parseResult = safeParseInt(value);
  if (parseResult.isErr()) {
    throw new InvalidOptionArgumentError(
      `--${paramName} could not be parsed to an integer: ${
        parseResult.err().message
      }`
    );
  }

  const n = parseResult.ok();
  if (n < 0) {
    throw new InvalidOptionArgumentError(`--${paramName} must be >= 0`);
  }

  return n;
}

function parsePaperLength(value: string): PaperLength {
  const parseResult = safeParseNumber(value);

  if (parseResult.isErr()) {
    throw new InvalidOptionArgumentError(
      `--paperLength could not be parsed to a number: ${
        parseResult.err().message
      }`
    );
  }

  const n = parseResult.ok();
  if (n !== PaperLength.Regular && n !== PaperLength.Long) {
    throw new InvalidOptionArgumentError(
      `--paperLength must be ${PaperLength.Regular} or ${PaperLength.Long}`
    );
  }

  return n;
}

program
  .name('test-system-limits')
  .description('Script to test mark-scan ballot generation limits')
  .requiredOption(
    '--configFilepath <string>',
    'Path to config file compliant with DeepPartialGenerateElectionConfigSchema'
  )
  .option(
    '--numCandidatesInElection <int>',
    'Total candidates in the election',
    (v) => parseIntStrict(v, 'numCandidatesInElection'),
    1000
  )
  .option(
    '--maxCharactersForAllWriteIns <int>',
    'Combined character count across all write-ins',
    (v) => parseIntStrict(v, 'maxCharactersForAllWriteIns'),
    100
  )
  .option(
    '--paperLength <value>',
    `Paper length in inches, either ${PaperLength.Regular} or ${PaperLength.Long}`,
    parsePaperLength,
    PaperLength.Regular
  )
  .helpOption('--help', 'Show help');

const ParamsSchema = z.object({
  numCandidatesInElection: positiveInt,
  maxCharactersForAllWriteIns: z.number().int().nonnegative(),
  paperLength: z.union([z.literal(11), z.literal(13.25)]),
  configFilepath: z.string(),
});

type Params = z.infer<typeof ParamsSchema>;

async function main() {
  program.parse(process.argv);
  const opts = program.opts();

  const params = ParamsSchema.parse(opts);
  console.log(JSON.stringify(params, null, 2));

  const configContents = readFileSync(params.configFilepath, 'utf8');
  const generateElectionConfig = safeParseJson(
    configContents,
    DeepPartialGenerateElectionConfigSchema
  ).unsafeUnwrap();

  console.log('Read election generation config:');
  console.log(generateElectionConfig);

  console.log('Generating election...');
  const election = generateElection(generateElectionConfig);

  const assetDir = tmp.dirSync();
  console.log('Generating election package...');
  const [ballotHash, electionPackageHash, fileName] =
    await generateElectionPackage(election, assetDir.name, false);

  console.log(
    `Wrote election package to ${assetDir.name} with hash ${ballotHash}:${electionPackageHash}`
  );

  const result = await readElectionPackageFromFile(
    path.join(assetDir.name, fileName)
  );
  result.assertOk('Could not read election package from file');
  const wrapper = assertDefined(result.ok());
  const { electionDefinition } = wrapper.electionPackage;

  // const precinctId = election.precincts[0].id;
  // const ballotStyle = assertDefined(
  //   election.ballotStyles.find((style) => style.precincts.includes(precinctId)),
  //   `Could not find a ballot style for precinct ${precinctId}`
  // );
  const ballotStyle = election.ballotStyles[0];
  const precinctId = ballotStyle.precincts[0];

  const votes: VotesDict = {};
  const ballot = await renderTestModeBallotWithoutLanguageContext(
    electionDefinition,
    precinctId,
    ballotStyle.id,
    votes
  );

  const ballotFilepath = path.join(
    assetDir.name,
    `bmd-ballot-${formatElectionPackageHash(
      electionPackageHash
    )}-${DateTime.now().toISODate()}`
  );
  writeFileSync(ballotFilepath, ballot);

  console.log('Wrote BMD test ballot to', ballotFilepath);
}

if (require.main === module) {
  void main();
}

export type { Params };
