import { LRUMap as LRUMapBase } from 'lru_map';

/**
 * Maximum number of tabulated election results to keep in the cache.
 */
export const ELECTION_RESULTS_CACHE_MAX_SIZE = 50;

/**
 * Wrapper around `lru_map`'s `LRUMap` for caching election results that uses a
 * default max size of {@link ELECTION_RESULTS_CACHE_MAX_SIZE}.
 */
export class LeastRecentlyUsedMap<K, V> extends LRUMapBase<K, V> {
  constructor() {
    super(ELECTION_RESULTS_CACHE_MAX_SIZE);
  }
}
