import { FullElectionExternalTally } from '@votingworks/types';
import { ElectionManagerStoreBackend } from './types';

/**
 * An in-memory backend for ElectionManagerStore. Useful for tests or an
 * ephemeral session.
 */
export class ElectionManagerStoreMemoryBackend
  implements ElectionManagerStoreBackend
{
  private fullElectionExternalTally?: FullElectionExternalTally;

  constructor({
    fullElectionExternalTally,
  }: {
    fullElectionExternalTally?: FullElectionExternalTally;
  } = {}) {
    this.fullElectionExternalTally = fullElectionExternalTally;
  }

  loadFullElectionExternalTally(): Promise<
    FullElectionExternalTally | undefined
  > {
    return Promise.resolve(this.fullElectionExternalTally);
  }

  async updateFullElectionExternalTally(
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void> {
    await Promise.resolve();
    this.fullElectionExternalTally = newFullElectionExternalTally;
  }

  async removeFullElectionExternalTally(): Promise<void> {
    await Promise.resolve();
    this.fullElectionExternalTally = undefined;
  }
}
