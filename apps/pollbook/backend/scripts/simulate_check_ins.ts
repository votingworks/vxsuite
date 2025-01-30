import * as grout from '@votingworks/grout';
import { safeParseInt } from '@votingworks/types';
import type { Api } from '../src/app';

const api = grout.createClient<Api>({
  baseUrl: 'http://localhost:3002/api',
});

async function getAllVoters() {
  const response = await api.getAllVoters();
  return response;
}

async function checkInVoter(voterId: string) {
  try {
    await api.checkInVoter({
      voterId,
      identificationMethod: {
        type: 'photoId',
        state: 'CA',
      },
    });
  } catch (error) {
    console.error(`Failed to check in voter ${voterId}:`, error);
  }
}

async function checkInAllVotersOnCurrentMachine(limit?: number) {
  try {
    console.log('Starting check-in simulation...');
    const voters = await getAllVoters();
    const votersToProcess = limit ? voters.slice(0, limit) : voters;
    console.log(
      `Found ${voters.length} voters, will process ${votersToProcess.length}`
    );

    let processed = 0;
    for (const voter of votersToProcess) {
      await checkInVoter(voter.voterId);
      processed += 1;

      if (processed % 100 === 0) {
        console.log(`Processed ${processed} voters`);
      }
    }

    console.log('Simulation completed!');
  } catch (error) {
    console.error('Simulation failed:', error);
  }
}

// Parse command line argument
const voterLimit = process.argv[2]
  ? safeParseInt(process.argv[2]).unsafeUnwrap()
  : undefined;
void checkInAllVotersOnCurrentMachine(voterLimit);
