// `lru_map` is a CommonJS module whose `LRUMap` export node's ESM loader can't
// detect via cjs-module-lexer, so a named import crashes at runtime under native
// node. Import the module object (node sets it as the default for CJS) and read
// the class off it instead.
import lruMap from 'lru_map';

const LruMapBase = lruMap.LRUMap;

/**
 * Maximum number of tabulated election results to keep in the cache.
 */
export const ELECTION_RESULTS_CACHE_MAX_SIZE = 50;

/**
 * Wrapper around `lru_map`'s `LRUMap` for caching election results that uses a
 * default max size of {@link ELECTION_RESULTS_CACHE_MAX_SIZE}.
 */
export class LeastRecentlyUsedMap<K, V> extends LruMapBase<K, V> {
  constructor() {
    super(ELECTION_RESULTS_CACHE_MAX_SIZE);
  }
}
