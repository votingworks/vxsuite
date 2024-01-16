import { ElectionResultsGroupMap } from '@votingworks/types/src/tabulation';
import {
  RealTallyCache,
  TallyCache,
  TallyCacheKey,
} from '../src/tabulation/tally_cache';

/**
 * A tally cache that uses the real tally cache, but also verifies that the
 * value returned from the cache is the same as the value that was set. This
 * is useful for testing that the cache is being cleared correctly.
 *
 * Note that the callback to `getOrSet` is always called, even if the value
 * is already in the cache. This is because the callback is used to generate
 * the expected value.
 */
export class TestTallyCache implements TallyCache {
  private readonly inner = new RealTallyCache();

  async getOrSet(
    key: TallyCacheKey,
    value: () => Promise<ElectionResultsGroupMap>
  ): Promise<ElectionResultsGroupMap> {
    const newValue = await value();
    const existingValue = await this.inner.getOrSet(key, () =>
      Promise.resolve(newValue)
    );

    expect(newValue).toEqual(existingValue);
    return newValue;
  }

  clear(): void {
    this.inner.clear();
  }
}
