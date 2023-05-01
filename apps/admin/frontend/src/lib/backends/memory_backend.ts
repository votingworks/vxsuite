import { FullElectionManualTally } from '@votingworks/types';
import { ElectionManagerStoreBackend } from './types';

/**
 * An in-memory backend for ElectionManagerStore. Useful for tests or an
 * ephemeral session.
 */
export class ElectionManagerStoreMemoryBackend
  implements ElectionManagerStoreBackend
{
  private fullElectionManualTally?: FullElectionManualTally;

  constructor({
    fullElectionManualTally,
  }: {
    fullElectionManualTally?: FullElectionManualTally;
  } = {}) {
    this.fullElectionManualTally = fullElectionManualTally;
  }

  loadFullElectionManualTally(): Promise<FullElectionManualTally | undefined> {
    return Promise.resolve(this.fullElectionManualTally);
  }

  async updateFullElectionManualTally(
    newFullElectionManualTally: FullElectionManualTally
  ): Promise<void> {
    await Promise.resolve();
    this.fullElectionManualTally = newFullElectionManualTally;
  }

  async removeFullElectionManualTally(): Promise<void> {
    await Promise.resolve();
    this.fullElectionManualTally = undefined;
  }
}
