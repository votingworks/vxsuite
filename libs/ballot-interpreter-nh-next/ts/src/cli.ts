import { assert, err, find, iter, ok, Result } from '@votingworks/basics';
import {
  ElectionDefinition,
  mapSheet,
  Optional,
  safeParseElectionDefinition,
  safeParseJson,
  SheetOf,
} from '@votingworks/types';
import { jsonStream } from '@votingworks/utils';
import Sqlite3 from 'better-sqlite3';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { basename, dirname, isAbsolute, join } from 'path';
import { once } from 'stream';
import { interpret } from './interpret';
import { InterpretedBallotCard, InterpretError } from './types';

function usage(out: NodeJS.WritableStream): void {
  out.write(
    `Usage: interpret <election.json> <ballot-side-a.jpeg> <ballot-side-b.jpeg>\n` +
      `       interpret <scan-workspace> [<sheet-id> …]\n`
  );
}

/**
 * Similar to using the promise version of `pipeline`, but does not
 * automatically close the destination stream.
 */
async function writeIterToStream(
  source: Iterable<string> | AsyncIterable<string>,
  out: NodeJS.WritableStream
) {
  for await (const chunk of source) {
    if (!out.write(chunk)) {
      // handle backpressure
      await once(out, 'drain');
    }
  }
}

function prettyPrintInterpretation({
  electionDefinition,
  paths,
  stdout,
  interpretedBallotCard,
}: {
  electionDefinition: ElectionDefinition;
  paths: SheetOf<string>;
  stdout: NodeJS.WritableStream;
  interpretedBallotCard: InterpretedBallotCard;
}) {
  const thresholds = electionDefinition.election.markThresholds;

  if (!thresholds) {
    stdout.write(
      `Warning: No mark thresholds defined in election definition; cannot render marks as votes.\n`
    );
  }

  stdout.write(`${chalk.bold('Paths:')}\n`);
  stdout.write(`- ${paths[0]}\n`);
  stdout.write(`- ${paths[1]}\n`);
  stdout.write(`\n`);

  const marksByContest = iter(interpretedBallotCard.front.marks)
    .chain(interpretedBallotCard.back.marks)
    .toMap(([{ contestId }]) => contestId);

  for (const [contestId, marks] of marksByContest) {
    const contest = find(
      electionDefinition.election.contests,
      (c) => c.id === contestId
    );
    stdout.write(`${chalk.italic(contest.title)}\n`);

    for (const [gridPosition, scoredMark] of marks) {
      const candidate =
        contest.type === 'candidate' && gridPosition.type === 'option'
          ? contest.candidates.find((c) => c.id === gridPosition.optionId)
          : undefined;
      const displayName =
        contest.type === 'candidate'
          ? gridPosition.type === 'option'
            ? candidate?.name ?? gridPosition.optionId
            : `Write-In #${gridPosition.writeInIndex + 1}`
          : contest.type === 'yesno'
          ? gridPosition.type === 'option' && gridPosition.optionId === 'yes'
            ? contest.yesOption?.label ?? 'Yes'
            : contest.noOption?.label ?? 'No'
          : 'Unknown';

      stdout.write(
        `${
          !scoredMark || !thresholds
            ? ' '
            : scoredMark.fillScore < thresholds.marginal
            ? '⬜️'
            : scoredMark.fillScore < thresholds.definite
            ? '❓'
            : '✅'
        } ${
          scoredMark
            ? chalk.dim(
                `(${(scoredMark.fillScore * 100).toFixed(2).padStart(5)}%)`
              )
            : ''
        } ${displayName}\n`
      );
    }

    stdout.write('\n');
  }
}

async function interpretFiles(
  electionDefinitionOrPath: ElectionDefinition | string,
  [ballotPathSideA, ballotPathSideB]: SheetOf<string>,
  {
    stdout,
    stderr,
    json = false,
    debug = false,
  }: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    json?: boolean;
    debug?: boolean;
  }
): Promise<number> {
  let electionDefinition: ElectionDefinition;

  if (typeof electionDefinitionOrPath === 'string') {
    const parseElectionDefinitionResult = safeParseElectionDefinition(
      await fs.readFile(electionDefinitionOrPath, 'utf8')
    );

    if (parseElectionDefinitionResult.isErr()) {
      stderr.write(
        `Error parsing election definition: ${
          parseElectionDefinitionResult.err().message
        }\n`
      );
      usage(stderr);
      return 1;
    }

    electionDefinition = parseElectionDefinitionResult.ok();
  } else {
    electionDefinition = electionDefinitionOrPath;
  }

  const result = interpret(
    electionDefinition,
    [ballotPathSideA, ballotPathSideB],
    { debug }
  );

  if (result.isErr()) {
    stderr.write(chalk.red(`Error interpreting ballot:\n`));
    await writeIterToStream(
      jsonStream<InterpretError>(result.err(), { compact: false }),
      stderr
    );
    stderr.write(`\n\n`);
    return 1;
  }

  if (json) {
    await writeIterToStream(
      jsonStream(result.ok(), { compact: false }),
      stdout
    );
  } else {
    prettyPrintInterpretation({
      electionDefinition,
      paths: [ballotPathSideA, ballotPathSideB],
      interpretedBallotCard: result.ok(),
      stdout,
    });
  }

  return 0;
}

function tryReadElectionFromElectionTable(
  db: Sqlite3.Database
): Optional<ElectionDefinition> {
  try {
    const electionData = (
      db
        .prepare('SELECT election_data as electionData FROM election LIMIT 1')
        .get() as Optional<{ electionData: string }>
    )?.electionData;

    return electionData
      ? safeParseElectionDefinition(electionData).ok()
      : undefined;
  } catch {
    return undefined;
  }
}

function tryReadElectionFromConfigTable(
  db: Sqlite3.Database
): Optional<ElectionDefinition> {
  try {
    const electionDefinitionJson = (
      db
        .prepare(
          'SELECT value as electionDefinitionJson FROM configs where key = ?'
        )
        .get('election') as Optional<{ electionDefinitionJson: string }>
    )?.electionDefinitionJson;

    // this election data is unlikely to be valid, so parse non-strictly
    return electionDefinitionJson
      ? (safeParseJson(electionDefinitionJson).ok() as ElectionDefinition)
      : undefined;
  } catch (error) {
    return undefined;
  }
}

function readElectionDefinitionFromDatabase(
  db: Sqlite3.Database
): Optional<ElectionDefinition> {
  return (
    tryReadElectionFromElectionTable(db) ?? tryReadElectionFromConfigTable(db)
  );
}

async function interpretWorkspace(
  workspacePath: string,
  {
    stdout,
    stderr,
    sheetIds,
    json = false,
    debug = false,
  }: {
    stdout: NodeJS.WriteStream;
    stderr: NodeJS.WriteStream;
    sheetIds: Iterable<string>;
    json?: boolean;
    debug?: boolean;
  }
): Promise<number> {
  const dbPath = join(workspacePath, 'ballots.db');

  if (!(await fs.stat(dbPath)).isFile()) {
    stderr.write(`No ballots database found in workspace.\n`);
    stderr.write(`Expected to find ${dbPath}.\n`);
    return 1;
  }

  const db = new Sqlite3(dbPath);
  const electionDefinition = readElectionDefinitionFromDatabase(db);

  if (!electionDefinition) {
    stderr.write(
      `No election data found in workspace. Is the workspace configured?\n`
    );
    return 1;
  }

  const sheetIdsArray = [...sheetIds];
  const sheets = (
    sheetIdsArray.length
      ? db
          .prepare(
            'SELECT id, front_original_filename as frontPath, back_original_filename as backPath FROM sheets WHERE id IN ?'
          )
          .all(sheetIdsArray)
      : db
          .prepare(
            'SELECT id, front_original_filename as frontPath, back_original_filename as backPath FROM sheets'
          )
          .all()
  ) as Array<{ id: string; frontPath: string; backPath: string }>;

  /**
   * Look for the ballot images where the database says they are, and if not
   * found, look in the `ballot-images` directory in the workspace.
   */
  async function correctBallotImagePaths(
    paths: SheetOf<string>
  ): Promise<Result<SheetOf<string>, { attemptedPaths: string[] }>> {
    const attemptedPaths: string[] = [];

    const [frontPath, backPath] = await mapSheet(paths, async (path) => {
      const pathsToTry = [
        isAbsolute(path) ? path : join(dirname(dbPath), path),
        join(workspacePath, 'ballot-images', basename(path)),
      ];

      for (const pathToTry of pathsToTry) {
        try {
          assert((await fs.stat(pathToTry)).isFile());
          return pathToTry;
        } catch {
          attemptedPaths.push(path);
        }
      }

      return undefined;
    });

    return frontPath && backPath
      ? ok([frontPath, backPath])
      : err({ attemptedPaths });
  }

  let count = 0;
  let errorCount = 0;

  for (const { id, frontPath, backPath } of sheets) {
    stdout.write(`${chalk.bold('Sheet ID:')} ${id}\n`);

    const correctionResult = await correctBallotImagePaths([
      frontPath,
      backPath,
    ]);

    if (correctionResult.isErr()) {
      stderr.write(
        chalk.red(`Error finding ballot images; attempted paths:\n`)
      );
      for (const path of correctionResult.err().attemptedPaths) {
        stderr.write(`- ${path}\n`);
      }
      return 1;
    }

    const exitCode = await interpretFiles(
      electionDefinition,
      correctionResult.ok(),
      { stdout, stderr, json, debug }
    );

    count += 1;
    if (exitCode !== 0) {
      errorCount += 1;
    }
  }

  stdout.write(
    `\n${chalk.bold('Summary:')} ${count} sheets${
      errorCount > 0 ? `, ${chalk.red(`${errorCount} errors`)}` : ''
    }\n`
  );

  return errorCount > 0 ? 1 : 0;
}

/**
 * CLI for running the interpreter standalone.
 */
export async function main(args: string[]): Promise<number> {
  const { stdout, stderr } = process;
  let workspacePath: string | undefined;
  const sheetIds = new Set<string>();
  let electionDefinitionPath: string | undefined;
  let ballotPathSideA: string | undefined;
  let ballotPathSideB: string | undefined;
  let json = false;
  let debug = false;

  for (const arg of args) {
    if (arg === '-h' || arg === '--help') {
      usage(stdout);
      return 0;
    }

    if (arg === '-j' || arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '-d' || arg === '--debug') {
      debug = true;
      continue;
    }

    if (arg.startsWith('-')) {
      stderr.write(`Unknown option: ${arg}\n`);
      usage(stderr);
      return 1;
    }

    if (!workspacePath && !electionDefinitionPath) {
      const stat = await fs.stat(arg);
      if (stat.isDirectory()) {
        workspacePath = arg;
      } else if (stat.isFile()) {
        electionDefinitionPath = arg;
      } else {
        stderr.write(
          `Expected an election definition file or scan workspace: ${arg}\n`
        );
        usage(stderr);
        return 1;
      }
    } else if (electionDefinitionPath && !ballotPathSideA) {
      ballotPathSideA = arg;
    } else if (electionDefinitionPath && !ballotPathSideB) {
      ballotPathSideB = arg;
    } else if (workspacePath) {
      sheetIds.add(arg);
    } else {
      stderr.write(`Unexpected argument: ${arg}\n`);
      usage(stderr);
      return 1;
    }
  }

  if (workspacePath) {
    return await interpretWorkspace(workspacePath, {
      sheetIds,
      stdout,
      stderr,
      json,
      debug,
    });
  }

  if (electionDefinitionPath && ballotPathSideA && ballotPathSideB) {
    return await interpretFiles(
      electionDefinitionPath,
      [ballotPathSideA, ballotPathSideB],
      { stdout, stderr, json, debug }
    );
  }

  usage(stderr);
  return 1;
}
