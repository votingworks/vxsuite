import { find, iter } from '@votingworks/basics';
import {
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { jsonStream } from '@votingworks/utils';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import { interpret } from './interpret';
import { InterpretedBallotCard, InterpretError } from './types';

function usage(out: NodeJS.WritableStream): void {
  out.write(
    `Usage: interpret <election.json> <ballot-side-a.jpeg> <ballot-side-b.jpeg>\n`
  );
}

function prettyPrintInterpretation(
  electionDefinition: ElectionDefinition,
  out: NodeJS.WritableStream,
  interpretedBallotCard: InterpretedBallotCard
) {
  const thresholds = electionDefinition.election.markThresholds;

  if (!thresholds) {
    out.write(
      `Warning: No mark thresholds defined in election definition; cannot render marks as votes.\n`
    );
  }

  const marksByContest = iter(interpretedBallotCard.front.marks)
    .chain(interpretedBallotCard.back.marks)
    .toMap(([{ contestId }]) => contestId);

  for (const [contestId, marks] of marksByContest) {
    const contest = find(
      electionDefinition.election.contests,
      (c) => c.id === contestId
    );
    out.write(`${chalk.italic(contest.title)}\n`);

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

      out.write(
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

    out.write('\n');
  }
}

/**
 * CLI for running the interpreter standalone.
 */
export async function main(args: string[]): Promise<number> {
  const { stdout, stderr } = process;
  let electionDefinitionPath: string | undefined;
  let ballotPathSideA: string | undefined;
  let ballotPathSideB: string | undefined;
  let json = false;

  for (const arg of args) {
    if (arg === '-h' || arg === '--help') {
      usage(stdout);
      return 0;
    }

    if (arg === '-j' || arg === '--json') {
      json = true;
      continue;
    }

    if (arg.startsWith('-')) {
      stderr.write(`Unknown option: ${arg}\n`);
      usage(stderr);
      return 1;
    }

    if (!electionDefinitionPath) {
      electionDefinitionPath = arg;
    } else if (!ballotPathSideA) {
      ballotPathSideA = arg;
    } else if (!ballotPathSideB) {
      ballotPathSideB = arg;
    } else {
      stderr.write(`Unexpected argument: ${arg}\n`);
      usage(stderr);
      return 1;
    }
  }

  if (!electionDefinitionPath || !ballotPathSideA || !ballotPathSideB) {
    usage(stderr);
    return 1;
  }

  const parseElectionDefinitionResult = safeParseElectionDefinition(
    await fs.readFile(electionDefinitionPath, 'utf8')
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

  const electionDefinition = parseElectionDefinitionResult.ok();

  const result = interpret(electionDefinition, [
    ballotPathSideA,
    ballotPathSideB,
  ]);

  if (result.isErr()) {
    stderr.write(`Error interpreting ballot:\n`);
    await pipeline(jsonStream<InterpretError>(result.err()), stderr);
    return 1;
  }

  if (json) {
    await pipeline(jsonStream(result.ok(), { compact: false }), stdout);
  } else {
    prettyPrintInterpretation(electionDefinition, stdout, result.ok());
  }

  return 0;
}
