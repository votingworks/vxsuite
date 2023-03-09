import {
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { ElectionManagerStoreBackend } from './types';

/**
 * An in-memory backend for ElectionManagerStore. Useful for tests or an
 * ephemeral session.
 */
export class ElectionManagerStoreMemoryBackend
  implements ElectionManagerStoreBackend
{
  private fullElectionExternalTallies: Map<
    ExternalTallySourceType,
    FullElectionExternalTally
  >;

  constructor({
    fullElectionExternalTallies,
  }: {
    fullElectionExternalTallies?: FullElectionExternalTallies;
  } = {}) {
    this.fullElectionExternalTallies = new Map([
      ...(fullElectionExternalTallies ?? []),
    ]);
  }

  loadFullElectionExternalTallies(): Promise<
    FullElectionExternalTallies | undefined
  > {
    return Promise.resolve(new Map(this.fullElectionExternalTallies));
  }

  async updateFullElectionExternalTally(
    sourceType: ExternalTallySourceType,
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void> {
    await Promise.resolve();
    assert(newFullElectionExternalTally.source === sourceType);
    this.fullElectionExternalTallies.set(
      sourceType,
      newFullElectionExternalTally
    );
  }

  async removeFullElectionExternalTally(
    sourceType: ExternalTallySourceType
  ): Promise<void> {
    await Promise.resolve();
    this.fullElectionExternalTallies.delete(sourceType);
  }

  async clearFullElectionExternalTallies(): Promise<void> {
    await Promise.resolve();
    this.fullElectionExternalTallies = new Map();
  }
}
