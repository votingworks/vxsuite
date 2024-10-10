import {
  assert,
  err,
  find,
  iter,
  ok,
  Optional,
  Result,
} from '@votingworks/basics';
import tmp from 'tmp';
import { writeImageData } from '@votingworks/image-utils';
import {
  DEFAULT_MARK_THRESHOLDS,
  ElectionDefinition,
  mapSheet,
  MarkThresholds,
  safeParseElectionDefinition,
  safeParseJson,
  SheetOf,
  SystemSettings,
  safeParseSystemSettings,
} from '@votingworks/types';
import { jsonStream } from '@votingworks/utils';
import Sqlite3 from 'better-sqlite3';
import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { once } from 'node:stream';
import { interpret } from './interpret';
import { InterpretedBallotCard, InterpretError } from './types';

interface IO {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

function usage(out: NodeJS.WritableStream): void {
  out.write(
    `${chalk.bold(
      'Usage:'
    )} interpret [options] <election-definition-path> <system-settings-path> <image-path> <image-path>\n`
  );
  out.write(
    `       interpret [options] <scan-workspace-path> [<sheet-id> …]\n`
  );
  out.write(
    `       interpret [options] <election-definition-path> <system-settings-path> <cast-vote-record-folder-path>\n`
  );
  out.write(`\n`);
  out.write(chalk.bold(`Options:\n`));
  out.write('  -h, --help       Show this help text.\n');
  out.write('  -w, --write-ins  Score write-in areas.\n');
  out.write(`  -j, --json       Output JSON instead of human-readable text.\n`);
  out.write(
    `  -d, --debug  Output debug information (images alongside inputs).\n`
  );
  out.write(
    '  --default-mark-thresholds  Use default mark thresholds if none provided.\n'
  );
  out.write(`\n`);
  out.write(chalk.bold('Examples:\n'));
  out.write(chalk.dim(`  # Interpret a single ballot\n`));
  out.write(
    `  interpret election.json system-settings.json ballot-side-a.jpeg ballot-side-b.jpeg\n`
  );
  out.write(`\n`);
  out.write(chalk.dim(`  # Interpret all ballots in a scan workspace\n`));
  out.write(`  interpret path/to/workspace\n`);
  out.write(`\n`);
  out.write(chalk.dim(`  # Interpret specific sheets in a scan workspace\n`));
  out.write(`  interpret path/to/workspace d34d-b33f\n`);
  out.write(`\n`);
  out.write(chalk.dim(`  # Write debug images alongside input images\n`));
  out.write(
    chalk.dim(`  # (i.e. ballot-side-a_debug_scored_bubble_marks.png)\n`)
  );
  out.write(
    `  interpret -d election.json system-settings.json ballot-side-a.jpeg ballot-side-b.jpeg\n`
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
  markThresholds,
  paths,
  stdout,
  interpretedBallotCard,
}: {
  electionDefinition: ElectionDefinition;
  markThresholds: MarkThresholds;
  paths: SheetOf<string>;
  stdout: NodeJS.WritableStream;
  interpretedBallotCard: InterpretedBallotCard;
}) {
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
          ? gridPosition.type === 'option' &&
            gridPosition.optionId === contest.yesOption.id
            ? contest.yesOption.label
            : contest.noOption.label
          : 'Unknown';

      stdout.write(
        `${
          !scoredMark
            ? ' '
            : scoredMark.fillScore < markThresholds.marginal
            ? '⬜️'
            : scoredMark.fillScore < markThresholds.definite
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

async function writeNormalizedImages({
  front,
  back,
}: InterpretedBallotCard): Promise<{
  front: string;
  back: string;
}> {
  const frontPath = tmp.tmpNameSync({
    prefix: 'normalized-front',
    postfix: '.png',
  });
  const backPath = tmp.tmpNameSync({
    prefix: 'normalized-back',
    postfix: '.png',
  });
  await writeImageData(frontPath, {
    ...front.normalizedImage,
    data: new Uint8ClampedArray(front.normalizedImage.data),
  });
  await writeImageData(backPath, {
    ...back.normalizedImage,
    data: new Uint8ClampedArray(back.normalizedImage.data),
  });
  return { front: frontPath, back: backPath };
}

async function interpretFiles(
  electionDefinition: ElectionDefinition,
  systemSettings: SystemSettings | undefined,
  [ballotPathSideA, ballotPathSideB]: SheetOf<string>,
  {
    stdout,
    stderr,
    scoreWriteIns = false,
    json = false,
    debug = false,
    useDefaultMarkThresholds = false,
  }: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    scoreWriteIns?: boolean;
    json?: boolean;
    debug?: boolean;
    useDefaultMarkThresholds?: boolean;
  }
): Promise<number> {
  const result = interpret(
    electionDefinition,
    [ballotPathSideA, ballotPathSideB],
    { scoreWriteIns, debug }
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

  const interpreted = result.ok();

  if (json) {
    const normalizedImagePaths = await writeNormalizedImages(interpreted);
    await writeIterToStream(
      jsonStream(
        {
          ...interpreted,
          front: {
            ...interpreted.front,
            normalizedImage: normalizedImagePaths.front,
          },
          back: {
            ...interpreted.back,
            normalizedImage: normalizedImagePaths.back,
          },
        },
        { compact: false }
      ),
      stdout
    );
  } else {
    const markThresholds =
      systemSettings?.markThresholds ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (electionDefinition.election as any).markThresholds ??
      (useDefaultMarkThresholds ? DEFAULT_MARK_THRESHOLDS : undefined);

    if (!markThresholds) {
      stderr.write(
        `Could not find markThresholds in system settings or election definition.\n` +
          `Use --default-mark-thresholds to use default thresholds.\n`
      );
      return 1;
    }

    prettyPrintInterpretation({
      electionDefinition,
      markThresholds,
      paths: [ballotPathSideA, ballotPathSideB],
      interpretedBallotCard: interpreted,
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
    )?.electionData?.toString();

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
  } catch {
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

function readSystemSettingsFromDatabase(
  db: Sqlite3.Database
): Optional<SystemSettings> {
  try {
    const systemSettingsJson = (
      db.prepare(`SELECT data FROM system_settings`).get() as Optional<{
        data: string;
      }>
    )?.data;

    return systemSettingsJson
      ? (safeParseJson(systemSettingsJson).ok() as SystemSettings)
      : undefined;
  } catch {
    return undefined;
  }
}

async function interpretWorkspace(
  workspacePath: string,
  {
    stdout,
    stderr,
    sheetIds,
    scoreWriteIns = false,
    json = false,
    debug = false,
    useDefaultMarkThresholds = false,
  }: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    sheetIds: Iterable<string>;
    scoreWriteIns?: boolean;
    json?: boolean;
    debug?: boolean;
    useDefaultMarkThresholds?: boolean;
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

  const systemSettings = readSystemSettingsFromDatabase(db);

  const sheetIdsArray = [...sheetIds];
  const sheets = (
    sheetIdsArray.length
      ? db
          .prepare(
            'SELECT id, front_image_path as frontPath, back_image_path as backPath FROM sheets WHERE id IN (?)'
          )
          .all(sheetIdsArray.join(','))
      : db
          .prepare(
            'SELECT id, front_image_path as frontPath, back_image_path as backPath FROM sheets'
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
      systemSettings,
      correctionResult.ok(),
      { stdout, stderr, scoreWriteIns, json, debug, useDefaultMarkThresholds }
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

async function interpretCastVoteRecordFolder(
  electionDefinition: ElectionDefinition,
  systemSettings: SystemSettings | undefined,
  castVoteRecordFolderPath: string,
  {
    stdout,
    stderr,
    scoreWriteIns = false,
    json = false,
    debug = false,
    useDefaultMarkThresholds = false,
  }: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    scoreWriteIns?: boolean;
    json?: boolean;
    debug?: boolean;
    useDefaultMarkThresholds?: boolean;
  }
): Promise<number> {
  const subdirectories = await fs.readdir(castVoteRecordFolderPath);
  for (const subdir of subdirectories) {
    const subdirPath = join(castVoteRecordFolderPath, subdir);
    if ((await fs.stat(subdirPath)).isDirectory()) {
      const files = await fs.readdir(subdirPath);
      let frontPath: string | undefined;
      let backPath: string | undefined;
      for (const file of files) {
        if (/back\.(jpe?g|png)$/.test(file)) {
          backPath = join(subdirPath, file);
        } else if (/front\.(jpe?g|png)$/.test(file)) {
          frontPath = join(subdirPath, file);
        }
      }
      if (frontPath && backPath) {
        await interpretFiles(
          electionDefinition,
          systemSettings,
          [frontPath, backPath],
          {
            stdout,
            stderr,
            scoreWriteIns,
            json,
            debug,
            useDefaultMarkThresholds,
          }
        );
      }
    }
  }
  return 0;
}

/**
 * CLI for running the interpreter standalone.
 */
export async function main(args: string[], io: IO = process): Promise<number> {
  let workspacePath: string | undefined;
  const sheetIds = new Set<string>();
  let electionDefinitionPath: string | undefined;
  let systemSettingsPath: string | undefined;
  let castVoteRecordFolderPath: string | undefined;
  let ballotPathSideA: string | undefined;
  let ballotPathSideB: string | undefined;
  let scoreWriteIns: boolean | undefined;
  let json = false;
  let debug = false;
  let useDefaultMarkThresholds = false;

  for (const arg of args) {
    if (arg === '-h' || arg === '--help') {
      usage(io.stdout);
      return 0;
    }

    if (arg === '-w' || arg === '--write-ins') {
      scoreWriteIns = true;
      continue;
    }

    if (arg === '-j' || arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '-d' || arg === '--debug') {
      debug = true;
      continue;
    }

    if (arg === '--default-mark-thresholds') {
      useDefaultMarkThresholds = true;
      continue;
    }

    if (arg.startsWith('-')) {
      io.stderr.write(`Unknown option: ${arg}\n`);
      usage(io.stderr);
      return 1;
    }

    if (!workspacePath && !electionDefinitionPath) {
      const stat = await fs.stat(arg);
      if (stat.isDirectory()) {
        workspacePath = arg;
      } else if (stat.isFile()) {
        electionDefinitionPath = arg;
      } else {
        io.stderr.write(
          `Expected an election definition file or scan workspace: ${arg}\n`
        );
        usage(io.stderr);
        return 1;
      }
    } else if (electionDefinitionPath && !systemSettingsPath) {
      systemSettingsPath = arg;
    } else if (
      electionDefinitionPath &&
      systemSettingsPath &&
      !ballotPathSideA &&
      !castVoteRecordFolderPath
    ) {
      const stat = await fs.stat(arg);
      if (stat.isDirectory()) {
        castVoteRecordFolderPath = arg;
      } else if (stat.isFile()) {
        ballotPathSideA = arg;
      } else {
        io.stderr.write(
          `Expected a ballot image path or cvr folder path ${arg}\n`
        );
        usage(io.stderr);
        return 1;
      }
    } else if (
      electionDefinitionPath &&
      systemSettingsPath &&
      ballotPathSideA &&
      !ballotPathSideB
    ) {
      ballotPathSideB = arg;
    } else if (workspacePath) {
      sheetIds.add(arg);
    } else {
      io.stderr.write(`Unexpected argument: ${arg}\n`);
      usage(io.stderr);
      return 1;
    }
  }

  if (workspacePath) {
    return await interpretWorkspace(workspacePath, {
      sheetIds,
      stdout: io.stdout,
      stderr: io.stderr,
      json,
      scoreWriteIns,
      debug,
      useDefaultMarkThresholds,
    });
  }

  if (electionDefinitionPath && systemSettingsPath) {
    const parseElectionDefinitionResult = safeParseElectionDefinition(
      await fs.readFile(electionDefinitionPath, 'utf8')
    );

    if (parseElectionDefinitionResult.isErr()) {
      io.stderr.write(
        `Error parsing election definition: ${
          parseElectionDefinitionResult.err().message
        }\n`
      );
      usage(io.stderr);
      return 1;
    }

    const electionDefinition = parseElectionDefinitionResult.ok();

    const parseSystemSettingsResult = safeParseSystemSettings(
      await fs.readFile(systemSettingsPath, 'utf8')
    );

    // Just warn, don't fail, if the system settings are invalid, since we may
    // be using old data that doesn't parse anymore, and we may want to allow
    // the default mark thresholds to be used.
    if (parseSystemSettingsResult.isErr()) {
      io.stderr.write(
        `Warning: error parsing system settings: ${
          parseSystemSettingsResult.err().message
        }\n`
      );
    }

    const systemSettings = parseSystemSettingsResult.ok();
    if (ballotPathSideA && ballotPathSideB) {
      return await interpretFiles(
        electionDefinition,
        systemSettings,
        [ballotPathSideA, ballotPathSideB],
        {
          stdout: io.stdout,
          stderr: io.stderr,
          scoreWriteIns,
          json,
          debug,
          useDefaultMarkThresholds,
        }
      );
    }
    if (castVoteRecordFolderPath) {
      await interpretCastVoteRecordFolder(
        electionDefinition,
        systemSettings,
        castVoteRecordFolderPath,
        {
          stdout: io.stdout,
          stderr: io.stderr,
          scoreWriteIns,
          json,
          debug,
          useDefaultMarkThresholds,
        }
      );
      return 0;
    }
  }

  usage(io.stderr);
  return 1;
}
