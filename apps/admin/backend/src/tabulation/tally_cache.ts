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
 * A cache for cast vote record tabulation results.
 */
export interface TallyCache {
  getOrSet(
    key: TallyCacheKey,
    value: () => Promise<Tabulation.ElectionResultsGroupMap>
  ): Promise<Tabulation.ElectionResultsGroupMap>;
  clear(): void;
}

/**
 * In-memory caching for cast vote record tabulation results. This is not intended
 * for caching full election results - with manual data and write-in adjudication
 * information - only for the results of tabulating scanned cast vote records using
 * the filters and groupings they support.
 */
export class RealTallyCache implements TallyCache {
  private readonly cache = new NodeCache();

  private hash(key: TallyCacheKey): string {
    return hash(key, {
      unorderedObjects: true,
      unorderedArrays: true,
    });
  }

  async getOrSet(
    key: TallyCacheKey,
    value: () => Promise<Tabulation.ElectionResultsGroupMap>
  ): Promise<Tabulation.ElectionResultsGroupMap> {
    const hashKey = this.hash(key);
    const existing = this.cache.get(
      hashKey
    ) as Tabulation.ElectionResultsGroupMap;
    if (existing) {
      return existing;
    }
    const newValue = await value();
    this.cache.set(hashKey, newValue);
    return newValue;
  }

  clear(): void {
    this.cache.flushAll();
  }
}
