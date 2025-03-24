import * as grout from '@votingworks/grout';
import yargs, { alias } from 'yargs';
import { hideBin } from 'yargs/helpers';
import { safeParseInt } from '@votingworks/types';
import type { Api } from '../src/app';

const api = grout.createClient<Api>({
  baseUrl: 'http://localhost:3002/api',
});

async function getAllVoters() {
  try {
    const response = await api.getAllVoters();
    return response;
  } catch (error) {
    console.error('Failed to fetch voters:', error);
    return []; // Return an empty array if offline
  }
}

async function checkInVoter(voterId: string) {
  try {
    await api.checkInVoter({
      voterId,
      identificationMethod: { type: 'default' },
    });
  } catch (error) {
    console.error(`Failed to check in voter ${voterId}:`, error);
  }
}

function isVoterInRange(voter: { lastName: string }, range: string): boolean {
  const [start, end] = range.split('-').map((char) => char.toUpperCase());
  const lastNameInitial = voter.lastName[0].toUpperCase();
  return lastNameInitial >= start && lastNameInitial <= end;
}

async function checkInAllVotersOnCurrentMachine(
  limit?: number,
  range?: string,
  slow?: string
) {
  try {
    console.log('Starting check-in simulation...');
    let voters = await getAllVoters();

    if (range) {
      voters = voters.filter((voter) => isVoterInRange(voter, range));
    }

    const sortedVoters = [...voters].sort((a, b) => {
      const lastNameComparison = a.lastName.localeCompare(b.lastName);
      return lastNameComparison !== 0
        ? lastNameComparison
        : a.firstName.localeCompare(b.firstName);
    });

    const votersToProcess = limit ? sortedVoters.slice(0, limit) : sortedVoters;
    console.log(
      `Found ${sortedVoters.length} voters, will process ${votersToProcess.length}`
    );

    let processed = 0;
    for (const voter of votersToProcess) {
      if (slow !== undefined) {
        console.log('checking in voter', voter);
      }
      await checkInVoter(voter.voterId);
      processed += 1;

      if (processed % 100 === 0) {
        console.log(`Processed ${processed} voters`);
      }

      if (slow !== undefined) {
        const startInt = safeParseInt(slow.split('-')[0]).unsafeUnwrap() * 1000;
        const endInt = safeParseInt(slow.split('-')[1]).unsafeUnwrap() * 1000;
        const delay =
          Math.floor(Math.random() * startInt) + (endInt - startInt); // Random delay between 4 and 8 seconds
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      }
    }

    console.log('Simulation completed!');
  } catch (error) {
    console.error('Simulation failed:', error);
  }
}

interface SimulateScriptArguments {
  limit?: number;
  range?: string;
  slow?: string;
}

export async function main(argv: string[]): Promise<void> {
  // Parse command line arguments using yargs
  const parser = yargs()
    .strict()
    .exitProcess(false)
    .options({
      limit: {
        type: 'number',
        alias: 'l',
        description: 'Limit the number of voters to check in',
      },
      range: {
        type: 'string',
        alias: 'r',
        description: 'Specify a range of letters for last names (e.g., A-D)',
      },
      slow: {
        type: 'string',
        alias: 's',
        description:
          'Enable slow mode with random delays between check-ins. Delays will be in seconds between the interval provided (i.e. 4-8 is 4 to 8 seconds)',
      },
    })
    .help();
  const args = (await parser.parse(hideBin(argv))) as SimulateScriptArguments;

  const { limit } = args;
  const range =
    args.range && /^[A-Z]-[A-Z]$/i.test(args.range) ? args.range : undefined;
  const slow = args.slow && /^\d+-\d+$/.test(args.slow) ? args.slow : undefined;

  await checkInAllVotersOnCurrentMachine(limit, range, slow);
}
