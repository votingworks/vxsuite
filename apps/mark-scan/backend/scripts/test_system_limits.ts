/* eslint-disable no-console */
import {
  Candidate,
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
  GenerateElectionConfig,
} from '@votingworks/fixture-generators';
import z from 'zod/v4';
import tmp from 'tmp';
import { readFileSync, writeFileSync } from 'node:fs';
import { readElectionPackageFromFile } from '@votingworks/backend';
import path from 'node:path';
import { assertDefined, iter, sleep } from '@votingworks/basics';
import { DateTime } from 'luxon';
import { interpretSimplexBmdBallot } from '@votingworks/ballot-interpreter';
import { pdfToImages } from '@votingworks/image-utils';
import { renderBallotForLimitTesting } from '../src/util/render_ballot';

const ELECTION_SCALE_STEP = 1;
const MAX_SELECTIONS_STEP = 2;

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
  .requiredOption(
    '--maxTotalSelections <int>',
    'Number of total selections across all contests',
    (v) => parseIntStrict(v, 'maxTotalSelections')
  )
  .requiredOption(
    '--maxCharactersForAllWriteIns <int>',
    'Combined character count across all write-ins',
    (v) => parseIntStrict(v, 'maxCharactersForAllWriteIns')
  )
  .option(
    '--paperLength <value>',
    `Paper length in inches, either ${PaperLength.Regular} or ${PaperLength.Long}`,
    parsePaperLength,
    PaperLength.Regular
  )
  .helpOption('--help', 'Show help');

const ParamsSchema = z.object({
  maxCharactersForAllWriteIns: z.number().int().nonnegative(),
  maxTotalSelections: positiveInt,
  paperLength: z.union([z.literal(11), z.literal(13.25)]),
  configFilepath: z.string(),
});

type Params = z.infer<typeof ParamsSchema>;

async function generateElectionAndElectionPackage(
  generateElectionConfig: GenerateElectionConfig,
  outputDir: string
) {
  const generatedElection = generateElection(generateElectionConfig);

  console.log('Generating election package...');
  const [, electionPackageHash, packageFilePath] =
    await generateElectionPackage(generatedElection, outputDir, false);

  console.log(
    `Wrote election package for ${formatElectionPackageHash(
      electionPackageHash
    )} to ${packageFilePath} `
  );

  return packageFilePath;
}

function randomLetters(n: number) {
  return Array.from({ length: n }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join('');
}

function reduceElectionSize(
  generateElectionConfig: GenerateElectionConfig
): GenerateElectionConfig {
  const maxContestVoteFor =
    generateElectionConfig.maxContestVoteFor - ELECTION_SCALE_STEP;
  return {
    ...generateElectionConfig,
    maxContestVoteFor,
  };
}

async function main() {
  program.parse(process.argv);
  const opts = program.opts();

  const params = ParamsSchema.parse(opts);
  console.log(JSON.stringify(params, null, 2));

  const outputDir = tmp.dirSync();

  const configContents = readFileSync(params.configFilepath, 'utf8');
  let generateElectionConfig = safeParseJson(
    configContents,
    DeepPartialGenerateElectionConfigSchema
  ).unsafeUnwrap() as GenerateElectionConfig;
  console.log('Read initial election generation config:');
  console.log(generateElectionConfig);

  const MAX_TRIES = 10;
  let currentMaxTotalSelections = params.maxTotalSelections;

  // Go until we had a successful run last run but failed this run
  for (let i = 0; i < MAX_TRIES; i += 1) {
    console.log('Attempt', i);
    await sleep(1000);

    let electionPackageFilepath;
    try {
      electionPackageFilepath = await generateElectionAndElectionPackage(
        generateElectionConfig,
        outputDir.name
      );
    } catch (err) {
      if ((err as { error: string }).error === 'contestTooLong') {
        console.log(
          `Election package generation failed because contests were too long for HMPB ballot.`
        );
        generateElectionConfig = reduceElectionSize(generateElectionConfig);
        continue;
      }

      console.log(
        'Election package generation failed for unknown reason. Throwing error'
      );
      throw err;
    }

    try {
      console.log('Reading package from', electionPackageFilepath);
      const result = await readElectionPackageFromFile(electionPackageFilepath);
      result.assertOk('Could not read election package from file');
      const { electionPackage, electionPackageHash } = assertDefined(
        result.ok()
      );
      const { electionDefinition } = electionPackage;
      const { election } = electionDefinition;

      const ballotStyle = election.ballotStyles[0];
      const precinctId = ballotStyle.precincts[0];

      const writeInMax = params.maxCharactersForAllWriteIns;
      let currentWriteInChars = 0;
      // const charsPerWriteIn = writeInMax / 10;
      const charsPerWriteIn = 10;

      let totalSelections = 0;
      const votes: VotesDict = {};
      console.log('Making selections. Max =', currentMaxTotalSelections);
      for (const contest of election.contests) {
        if (
          totalSelections >= currentMaxTotalSelections &&
          currentWriteInChars >= writeInMax
        ) {
          break;
        }
        if (contest.type === 'candidate') {
          let contestVotes: Candidate[] = [];
          // Do write ins if we still have write-in character space left

          if (currentWriteInChars < writeInMax) {
            let writeInIndex = 0;
            while (
              currentWriteInChars < writeInMax &&
              writeInIndex < generateElectionConfig.maxContestVoteFor
            ) {
              const name = randomLetters(charsPerWriteIn);
              // console.log('writing in name:', name);
              const writeInCandidate: Candidate = {
                id: `write-in-candidate-${name}`,
                name,
                partyIds: [election.parties[0].id],
                isWriteIn: true,
                writeInIndex,
              };
              console.log(
                `writing in ${charsPerWriteIn} chars for ${writeInIndex}`
              );
              currentWriteInChars += charsPerWriteIn;
              contestVotes.push(writeInCandidate);
              writeInIndex += 1;
            }
          } else {
            // Pick the max number of candidates possible
            contestVotes = contest.candidates.slice(
              0,
              generateElectionConfig.maxContestVoteFor
            );

            // Pick a random number of selections
            // contestVotes = contest.candidates.slice(
            //   0,
            //   Math.floor(
            //     Math.random() * generateElectionConfig.maxContestVoteFor
            //   )
            // );

            // Cap to all-contest selection maximum
            const selectionsRemaining =
              currentMaxTotalSelections - totalSelections;
            if (contestVotes.length > selectionsRemaining) {
              contestVotes = contestVotes.slice(0, selectionsRemaining);
            }
          }

          votes[contest.id] = contestVotes;
          totalSelections += contestVotes.length;
          await sleep(250);

          console.log(
            `made ${contestVotes.length} candidate selections. total: ${totalSelections}`
          );
        } else {
          votes[contest.id] =
            Math.random() < 0.5
              ? [contest.noOption.id]
              : [contest.yesOption.id];
          totalSelections += 1;
          console.log(`made 1 y/n selection. total: ${totalSelections}`);
        }
      }

      console.log('Final votes:\n', votes);

      console.log('Total selections made:', totalSelections);

      const optionCounts = election.contests.flatMap((contest) =>
        contest.type === 'candidate' ? contest.candidates.length : 2
      );
      let totalContestOptions = 0;
      for (const n of optionCounts) {
        totalContestOptions += n;
      }
      console.log('Total contest options:', totalContestOptions);

      console.log('Attempting ballot render');
      const ballot = await renderBallotForLimitTesting(
        electionDefinition,
        precinctId,
        ballotStyle.id,
        votes,
        params.paperLength === 13.25 ? 'custom8x13pt25' : 'custom8x11'
      );
      console.log('Ballot render successful');
      const ballotFilepath = path.join(
        outputDir.name,
        `bmd-ballot-${formatElectionPackageHash(
          electionPackageHash
        )}-${DateTime.now().toISODate()}.pdf`
      );
      writeFileSync(ballotFilepath, ballot);

      console.log('Wrote BMD test ballot to', ballotFilepath);

      try {
        const ballotImages = await iter(
          pdfToImages(Uint8Array.from(ballot), {
            scale: 200 / 72,
          })
        )
          .map(({ page }) => page)
          .toArray();

        const interpretation = await interpretSimplexBmdBallot(
          ballotImages[0],
          {
            electionDefinition,
            precinctSelection: {
              kind: 'SinglePrecinct',
              precinctId,
            },
            testMode: true,
            markThresholds: {
              marginal: 0.05,
              definite: 0.07,
              writeInTextArea: 0.05,
            },
            adjudicationReasons: [],
          }
        );

        const frontInterpretation = interpretation[0].interpretation;
        if (frontInterpretation.type === 'InterpretedBmdPage') {
          console.log(
            `Successful ballot interpretation for config:
max selections = ${currentMaxTotalSelections}
actual selections = ${totalSelections}
actual write-in characters = ${currentWriteInChars}\n
initial config: ${JSON.stringify(generateElectionConfig, null, 2)}
            `
          );
          break;
        } else if (frontInterpretation.type === 'BlankPage') {
          console.log('Failed ballot interpretation, type = BlankPage');
          currentMaxTotalSelections -= MAX_SELECTIONS_STEP;
          continue;
        } else {
          throw new Error(
            `Failed ballot interpretation, type = ${frontInterpretation.type}`
          );
        }
      } catch (err) {
        console.error('Error interpreting BMD ballot:', (err as Error).message);
        continue;
      }
    } catch (err) {
      if (
        (err as Error).message ===
        'Unable to render ballot contents in a single page'
      ) {
        console.log(
          'Ballot render failed because contests were too long for BMD ballot.'
        );
        currentMaxTotalSelections -= MAX_SELECTIONS_STEP;
        continue;
      }

      console.log('Ballot render failed for unknown reason. Throwing error');
      throw err;
    }
  }

  console.log('Exited loop');
}

if (require.main === module) {
  main().catch((error) => console.error(error));
}

export type { Params };
