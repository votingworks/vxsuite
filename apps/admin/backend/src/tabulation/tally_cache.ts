import { Tabulation } from '@votingworks/types';
import hash from 'object-hash';
import NodeCache from 'node-cache';

/**
 * Specifies the parameters for election results tabulated from a filtered
 * and/or grouped set of cast vote records.
 */
export interface TallyCacheKey {
  electionId: string;
  filter: Tabulation.Filter;
  groupBy: Tabulation.GroupBy;
}

/**
 * In-memory caching for cast vote record tabulation results. This is not intended
 * for caching full election results - with manual data and write-in adjudication
 * information - only for the results of tabulating scanned cast vote records using
 * the filters and groupings they support.
 */
export class TallyCache {
  private readonly cache: NodeCache;

  constructor() {
    this.cache = new NodeCache();
  }

  private hash(key: TallyCacheKey): string {
    return hash(key, {
      unorderedObjects: true,
      unorderedArrays: true,
    });
  }

  set(key: TallyCacheKey, value: Tabulation.ElectionResultsGroupMap): void {
    this.cache.set(this.hash(key), value);
  }

  get(key: TallyCacheKey): Tabulation.ElectionResultsGroupMap | undefined {
    return this.cache.get(this.hash(key));
  }

  clear(): void {
    this.cache.flushAll();
  }
}
