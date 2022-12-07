import {
  Candidate,
  ElectionDefinition,
  err,
  ok,
  Result,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/utils';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { table } from 'table';
import { basename } from 'path';
import {
  imageDebugger,
  loadImageData,
  setDebug,
} from '@votingworks/image-utils';
import { Command, GlobalOptions } from '../types';
import { Interpreter } from '../..';
import { DEFAULT_MARK_SCORE_VOTE_THRESHOLD } from '../../interpreter';
import { Input, Interpreted } from '../../types';

export const name = 'interpret';
export const description = 'Interpret images of ballot pages';

export enum OutputFormat {
  JSON = 'json',
  Table = 'table',
}

export interface HelpOptions {
  help: true;
}

export interface InterpretOptions {
  help: false;
  electionDefinition: ElectionDefinition;
  testMode: boolean;
  templateInputs: readonly Input[];
  ballotInputs: readonly Input[];
  markScoreVoteThreshold: number;
  format: OutputFormat;
  debug: boolean;
}

export type Options = HelpOptions | InterpretOptions;

function makeInputFromBallotArgument(arg: string): Input {
  const [ballotPath, metadataPath] = arg.split(':');
  const input: Input = {
    id: () => ballotPath,
    imageData: () => loadImageData(ballotPath),
    /* istanbul ignore next */
    metadataPath: () => metadataPath,
    metadata: async () =>
      metadataPath
        ? JSON.parse(await fs.readFile(metadataPath, 'utf-8'))
        : undefined,
  };
  return input;
}

export function printHelp(
  globalOptions: GlobalOptions,
  out: NodeJS.WritableStream
): void {
  const $0 = basename(globalOptions.executablePath);
  out.write(`${$0} interpret -e JSON IMG1 [IMG2 …]\n`);
  out.write(`\n`);
  out.write(chalk.italic(`Examples\n`));
  out.write(`\n`);
  out.write(chalk.gray(`# Interpret ballots based on a single template.\n`));
  out.write(`${$0} interpret -e election.json -t template.png ballot*.png\n`);
  out.write(`\n`);
  out.write(chalk.gray(`# Interpret test mode ballots.\n`));
  out.write(
    `${$0} interpret -e election.json -T -t template.png ballot*.png\n`
  );
  out.write(`\n`);
  out.write(chalk.gray(`# Interpret ballots to JSON.\n`));
  out.write(
    `${$0} interpret -e election.json -f json template*.png ballot*.png\n`
  );
  out.write(`\n`);
  out.write(chalk.gray(`# Specify image metadata (file:metadata-file).\n`));
  out.write(
    `${$0} interpret -e election.json template1.png:template1-metadata.json template2.png:template2-metadata.json ballot1.png:ballot1-metadata.json\n`
  );
  out.write(`\n`);
  out.write(chalk.gray(`# Set an explicit minimum mark score (0-1).\n`));
  out.write(
    `${$0} interpret -e election.json -m 0.5 template*.png ballot*.png\n`
  );
}

export async function parseOptions({
  commandArgs: args,
}: GlobalOptions): Promise<Result<Options, Error>> {
  let electionDefinition: ElectionDefinition | undefined;
  let testMode = false;
  const templateInputs: Input[] = [];
  const ballotInputs: Input[] = [];
  let markScoreVoteThreshold = DEFAULT_MARK_SCORE_VOTE_THRESHOLD;
  let format = OutputFormat.Table;
  let debug = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        return ok({ help: true });

      case '-e':
      case '--election': {
        i += 1;
        const electionJsonFile = args[i];

        if (!electionJsonFile || electionJsonFile.startsWith('-')) {
          return err(
            new Error(
              `Expected election definition file after ${arg}, but got ${
                electionJsonFile || 'nothing'
              }.`
            )
          );
        }

        electionDefinition = safeParseElectionDefinition(
          await fs.readFile(electionJsonFile, 'utf8')
        ).unsafeUnwrap();
        break;
      }

      case '-m':
      case '--min-mark-score': {
        i += 1;
        const thresholdString = args[i];
        markScoreVoteThreshold =
          // eslint-disable-next-line vx/gts-safe-number-parse
          parseFloat(thresholdString) *
          (thresholdString.endsWith('%') ? 0.01 : 1);
        if (Number.isNaN(markScoreVoteThreshold)) {
          return err(new Error(`Invalid minimum mark score: ${args[i]}`));
        }
        break;
      }

      case '-f':
      case '--format':
        i += 1;
        format = args[i].toLowerCase() as OutputFormat;
        if (format !== OutputFormat.Table && format !== OutputFormat.JSON) {
          return err(new Error(`Unknown output format: ${format}`));
        }
        break;

      case '-t':
      case '--template': {
        i += 1;
        const templateFile = args[i];

        if (!templateFile || templateFile.startsWith('-')) {
          return err(
            new Error(
              `Expected template file after ${arg}, but got ${
                templateFile || 'nothing'
              }`
            )
          );
        }

        templateInputs.push(makeInputFromBallotArgument(templateFile));
        break;
      }

      case '-b':
      case '--ballot': {
        i += 1;
        const ballotFile = args[i];

        if (!ballotFile || ballotFile.startsWith('-')) {
          return err(
            new Error(
              `Expected ballot file after ${arg}, but got ${
                ballotFile || 'nothing'
              }`
            )
          );
        }

        ballotInputs.push(makeInputFromBallotArgument(ballotFile));
        break;
      }

      case '-T':
      case '--test-mode':
      case '--no-test-mode': {
        testMode = arg !== '--no-test-mode';
        break;
      }

      case '--debug': {
        debug = true;
        break;
      }

      default: {
        if (arg.startsWith('-')) {
          return err(new Error(`Unknown option: ${arg}`));
        }

        return err(new Error(`Unknown argument: ${arg}`));
      }
    }
  }

  if (!electionDefinition) {
    return err(new Error(`Required option 'election' is missing.`));
  }

  return ok({
    help: false,
    electionDefinition,
    testMode,
    templateInputs,
    ballotInputs,
    markScoreVoteThreshold,
    format,
    debug,
  });
}

export async function run(
  _commands: readonly Command[],
  globalOptions: GlobalOptions,
  _stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream
): Promise<number> {
  const optionsResult = await parseOptions(globalOptions);

  if (optionsResult.isErr()) {
    stderr.write(`${optionsResult.err().message}\n`);
    return 1;
  }

  const options = optionsResult.ok();

  if (options.help) {
    printHelp(globalOptions, stdout);
    return 0;
  }

  if (options.debug) {
    setDebug(true);
  }

  const interpreter = new Interpreter({
    electionDefinition: options.electionDefinition,
    testMode: options.testMode,
    markScoreVoteThreshold: options.markScoreVoteThreshold,
  });
  const ballotInputs = [...options.ballotInputs];

  for (const templateInput of options.templateInputs) {
    interpreter.addTemplate(
      await interpreter.interpretTemplate(
        await templateInput.imageData(),
        await templateInput.metadata?.(),
        {
          imdebug: imageDebugger(
            templateInput.id(),
            await templateInput.imageData()
          ),
        }
      )
    );
  }

  const results: Array<{ input: Input; interpreted: Interpreted }> = [];

  for (const ballotInput of ballotInputs) {
    results.push({
      input: ballotInput,
      interpreted: await interpreter.interpretBallot(
        await ballotInput.imageData(),
        await ballotInput.metadata?.(),
        {
          imdebug: imageDebugger(
            ballotInput.id(),
            await ballotInput.imageData()
          ),
        }
      ),
    });
  }

  switch (options.format) {
    case OutputFormat.JSON:
      stdout.write(
        JSON.stringify(
          results.map(({ input, interpreted }) => ({
            input: input.id(),
            interpreted: {
              metadata: interpreted.metadata,
              votes: interpreted.ballot.votes,
              marks: interpreted.marks
                .filter((mark) => mark.score > 0)
                .map((mark) => ({
                  type: mark.type,
                  contest: mark.contestId,
                  option: mark.optionId,
                  score: mark.score,
                  bounds: mark.bounds,
                  target: mark.target,
                })),
            },
          })),
          undefined,
          2
        )
      );
      break;

    case OutputFormat.Table:
      stdout.write(
        table([
          [
            chalk.bold('Contest'),
            ...results.map(({ input }) => chalk.bold(input.id())),
          ],
          ...options.electionDefinition.election.contests.map((contest) => [
            contest.title,
            ...results.map(({ interpreted }) => {
              const vote = interpreted.ballot.votes[contest.id];

              if (contest.type === 'candidate') {
                const candidates = vote as Candidate[] | undefined;
                return (
                  candidates
                    ?.map((candidate) =>
                      candidate.isWriteIn
                        ? chalk.italic(candidate.name)
                        : candidate.name
                    )
                    .join(', ') ?? ''
                );
              }
              const yesnos = vote as Array<'yes' | 'no'> | undefined;
              return (
                yesnos
                  ?.map((v) =>
                    v === 'yes'
                      ? chalk.green(v)
                      : v === 'no'
                      ? chalk.red(v)
                      : ''
                  )
                  .join(', ') ?? ''
              );
            }),
          ]),
        ])
      );
      break;

    default:
      /* istanbul ignore next */
      throwIllegalValue(options.format);
  }

  return 0;
}
