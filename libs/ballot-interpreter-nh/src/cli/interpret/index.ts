import { Result, ok, err, groupBy, find } from '@votingworks/basics';
import { writeImageData } from '@votingworks/image-utils';
import {
  expandEitherNeitherContests,
  MarkThresholds,
  safeParseElectionDefinition,
  safeParseInt,
  safeParseNumber,
} from '@votingworks/types';
import chalk from 'chalk';
import { enable as enableDebug } from 'debug';
import { promises as fs } from 'fs';
import { parse as parsePath } from 'path';
import { RealIo, Stdio } from '..';
import { DefaultMarkThresholds, interpret } from '../../interpret';

interface InterpretOptions {
  readonly type: 'interpret';
  readonly electionPath: string;
  readonly frontBallotPath: string;
  readonly backBallotPath: string;
  readonly markThresholds?: MarkThresholds;
  readonly json: boolean;
  readonly writeNormalizedImages: boolean;
  readonly debug: boolean;
}

interface HelpOptions {
  readonly type: 'help';
}

type Options = InterpretOptions | HelpOptions;

function parseOptions(args: readonly string[]): Result<Options, Error> {
  let electionPath: string | undefined;
  let frontBallotPath: string | undefined;
  let backBallotPath: string | undefined;
  let marginalMarkThreshold: number | undefined;
  let definiteMarkThreshold: number | undefined;
  let json = false;
  let writeNormalizedImages = false;
  let debug = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        return ok({ type: 'help' });

      case '-J':
      case '--json': {
        json = true;
        break;
      }

      case '-N':
      case '--write-normalized-images': {
        writeNormalizedImages = true;
        break;
      }

      case '-t':
      case '--mark-thresholds': {
        const value = args[i + 1];
        if (value === undefined) {
          return err(new Error(`missing value after ${arg}`));
        }
        const [marginalValue, definiteValue = marginalValue] = (
          value ?? ''
        ).split(',');
        const isMarginalPercent = marginalValue?.endsWith('%');
        const isDefinitePercent = definiteValue?.endsWith('%');
        const parseMarginalThresholdResult = isMarginalPercent
          ? safeParseNumber(marginalValue?.slice(0, -1), { min: 0, max: 100 })
          : safeParseNumber(marginalValue, { min: 0, max: 1 });
        const parseDefiniteThresholdResult = isDefinitePercent
          ? safeParseNumber(definiteValue?.slice(0, -1), { min: 0, max: 100 })
          : safeParseNumber(definiteValue, { min: 0, max: 1 });
        if (
          parseMarginalThresholdResult.isErr() ||
          parseDefiniteThresholdResult.isErr()
        ) {
          return err(new Error(`invalid value: ${value}`));
        }
        marginalMarkThreshold = isMarginalPercent
          ? parseMarginalThresholdResult.ok() / 100
          : parseMarginalThresholdResult.ok();
        definiteMarkThreshold = isDefinitePercent
          ? parseDefiniteThresholdResult.ok() / 100
          : parseDefiniteThresholdResult.ok();
        i += 1;
        break;
      }

      case '--debug': {
        debug = true;
        break;
      }

      default: {
        if (arg?.startsWith('-')) {
          return err(new Error(`unknown option: ${arg}`));
        }

        if (!electionPath && arg?.endsWith('.json')) {
          electionPath = arg;
        } else if (
          (!frontBallotPath || !backBallotPath) &&
          (arg?.endsWith('.jpeg') || arg?.endsWith('.jpg'))
        ) {
          if (frontBallotPath) {
            backBallotPath = arg;
          } else {
            frontBallotPath = arg;
          }
        } else {
          return err(new Error(`unexpected argument: ${arg}`));
        }
      }
    }
  }

  if (!electionPath) {
    return err(new Error('missing definition path'));
  }

  if (!frontBallotPath) {
    return err(new Error('missing front ballot path'));
  }

  if (!backBallotPath) {
    return err(new Error('missing back ballot path'));
  }

  return ok({
    type: 'interpret',
    electionPath,
    frontBallotPath,
    backBallotPath,
    markThresholds:
      typeof definiteMarkThreshold === 'number'
        ? {
            definite: definiteMarkThreshold,
            marginal: marginalMarkThreshold ?? definiteMarkThreshold,
          }
        : undefined,
    json,
    writeNormalizedImages,
    debug,
  });
}

function usage(out: NodeJS.WritableStream): void {
  const header = chalk.bold.underline;
  const comment = chalk.dim;

  out.write(`${header('Usage')}\n`);
  out.write(
    `  interpret [options] <election.json> <front-ballot.jpg> <back-ballot.jpg>\n`
  );
  out.write(`\n`);

  out.write(header(`Options\n`));
  out.write(
    `  -h, --help                                 Show this help message\n`
  );
  out.write(
    `  -t, --mark-thresholds [MARGINAL,]DEFINITE  Set mark thresholds (0-1 or 0%-100%)\n`
  );
  out.write(
    `                                             ${chalk.italic(
      'Uses the values from <election.json> by default'
    )}\n`
  );
  out.write(
    `  -J, --json                                 Output JSON instead of human-readable text\n`
  );
  out.write(
    `  -N, --write-normalized-images              Write normalized images to disk\n`
  );
  out.write(
    `  --debug                                    Enable debug logging\n`
  );

  out.write(`\n`);
  out.write(header(`Examples\n`));
  out.write(`  ${comment('# Interpret a ballot\n')}`);
  out.write(`  interpret election.json front.jpg back.jpg\n`);
  out.write(`\n`);
  out.write(`  ${comment('# Interpret a ballot with custom thresholds\n')}`);
  out.write(`  interpret -t 5%,8% election.json front.jpg back.jpg\n`);
  out.write(`\n`);
  out.write(`  ${comment('# Print output as JSON\n')}`);
  out.write(`  interpret --json election.json front.jpg back.jpg\n`);
}

/**
 * Interprets ballot front/back images as a new Hampshire ballot card and prints
 * the results.
 */
export async function main(
  args: readonly string[],
  io: Stdio = RealIo
): Promise<number> {
  const parseResult = parseOptions(args);

  if (parseResult.isErr()) {
    io.stderr.write(`error: ${parseResult.err().message}\n`);
    return 1;
  }

  const options = parseResult.ok();

  if (options.type === 'help') {
    usage(io.stdout);
    return 0;
  }

  if (options.debug) {
    enableDebug('ballot-interpreter-nh:*');
  }

  const { electionPath, frontBallotPath, backBallotPath } = options;

  const electionJson = await fs.readFile(electionPath, 'utf8');
  const parseElectionDefinitionResult =
    safeParseElectionDefinition(electionJson);

  if (parseElectionDefinitionResult.isErr()) {
    io.stderr.write(`error: ${parseElectionDefinitionResult.err().message}\n`);
    return 1;
  }

  const electionDefinition = parseElectionDefinitionResult.ok();
  const interpretResult = await interpret(
    electionDefinition,
    [frontBallotPath, backBallotPath],
    { isTestMode: true, markThresholds: options.markThresholds }
  );

  if (interpretResult.isErr()) {
    io.stderr.write(`error: ${interpretResult.err().message}\n`);
    return 1;
  }

  const [frontPageInterpretationResult, backPageInterpretationResult] =
    interpretResult.ok();

  const thresholds =
    options.markThresholds ??
    electionDefinition.election.markThresholds ??
    DefaultMarkThresholds;

  if (options.json) {
    io.stdout.write(
      JSON.stringify(
        {
          front: frontPageInterpretationResult.interpretation,
          back: backPageInterpretationResult.interpretation,
        },
        undefined,
        2
      )
    );
    return 0;
  }

  for (const [ballotPath, pageInterpretation, normalizedImage] of [
    [
      frontBallotPath,
      frontPageInterpretationResult.interpretation,
      frontPageInterpretationResult.normalizedImage,
    ],
    [
      backBallotPath,
      backPageInterpretationResult.interpretation,
      backPageInterpretationResult.normalizedImage,
    ],
  ] as const) {
    io.stdout.write(chalk.bold.underline(`${ballotPath}:\n`));
    if (pageInterpretation.type !== 'InterpretedHmpbPage') {
      io.stdout.write(`  ${chalk.red(pageInterpretation.type)}\n`);
      continue;
    }

    if (options.writeNormalizedImages && normalizedImage) {
      const pathParts = parsePath(ballotPath);
      await writeImageData(
        `${pathParts.dir}/${pathParts.base.slice(
          0,
          -pathParts.ext.length
        )}.normalized${pathParts.ext}`,
        normalizedImage
      );
    }

    const marksByContest = groupBy(
      pageInterpretation.markInfo.marks,
      (m) => m.contestId
    );

    for (const [contestId, marks] of marksByContest) {
      const contest = find(
        expandEitherNeitherContests(electionDefinition.election.contests),
        (c) => c.id === contestId
      );
      io.stdout.write(`${chalk.italic(contest.title)}\n`);

      for (const mark of marks) {
        let displayName = mark.optionId;

        if (contest.type === 'candidate') {
          const candidate = contest.candidates.find(
            (c) => c.id === mark.optionId
          );
          if (candidate) {
            displayName = candidate.name;
          } else {
            const match = mark.optionId.match(/^write-in-(\d+)$/);
            if (match) {
              displayName = `Write-In #${
                safeParseInt(match[1]).unsafeUnwrap() + 1
              }`;
            }
          }
        } else if (contest.type === 'yesno') {
          displayName =
            mark.optionId === 'yes'
              ? contest.yesOption?.label ?? 'Yes'
              : contest.noOption?.label ?? 'No';
        }

        io.stdout.write(
          `${
            mark.score < thresholds.marginal
              ? '⬜️'
              : mark.score < thresholds.definite
              ? '❓'
              : '✅'
          } ${chalk.dim(
            `(${(mark.score * 100).toFixed(2).padStart(5)}%)`
          )} ${displayName}\n`
        );
      }

      io.stdout.write('\n');
    }
  }

  return 0;
}
