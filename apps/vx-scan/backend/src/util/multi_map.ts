import { assert } from '@votingworks/utils';

/**
 * Maps composite keys to multiple values.
 */
export class MultiMap<K extends string[] = string[], V = unknown> {
  private readonly valueMap = new Map<string, Set<V>>();
  private readonly keyMap = new Map<string, K>();

  /**
   * Determine the internal key from the composite `key`.
   */
  private valueMapKey(key: K): string {
    const result = key.join('\0');
    if (!this.keyMap.has(result)) {
      this.keyMap.set(result, key);
    }
    return result;
  }

  /**
   * Gets all values for `key`.
   */
  get(key: K): Set<V> | undefined {
    const valueMapKey = this.valueMapKey(key);
    const values = this.valueMap.get(valueMapKey);
    return values && new Set([...values]);
  }

  /**
   * Adds `value` to the list of values for `key`.
   */
  set(key: K, value: V): this {
    const valueMapKey = this.valueMapKey(key);
    this.valueMap.set(
      valueMapKey,
      (this.valueMap.get(valueMapKey) ?? new Set()).add(value)
    );
    return this;
  }

  /**
   * Delete all values for `key`.
   */
  delete(key: K): boolean;

  /**
   * Delete a single value for `key`.
   */
  delete(key: K, value: V): boolean;

  delete(key: K, value?: V): boolean {
    const valueMapKey = this.valueMapKey(key);
    if (typeof value === 'undefined') {
      return this.valueMap.delete(valueMapKey);
    }

    const set = this.valueMap.get(valueMapKey);
    return set?.delete(value) && set.size === 0
      ? this.valueMap.delete(valueMapKey)
      : false;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.valueMap.clear();
  }

  /**
   * The number of unique keys.
   */
  get size(): number {
    return this.valueMap.size;
  }

  /**
   * The number of unique keys.
   */
  get keySize(): number {
    return this.size;
  }

  /**
   * The number of values in all keys.
   */
  get valueSize(): number {
    return [...this.valueMap.values()].reduce(
      (size, values) => size + values.size,
      0
    );
  }

  /**
   * Iterates through keys/values in the order in which keys were added.
   */
  *[Symbol.iterator](): Generator<[K, Set<V>]> {
    for (const [valueMapKey, values] of this.valueMap) {
      const key = this.keyMap.get(valueMapKey);
      assert(key);
      assert(values);
      yield [key, new Set([...values])];
    }
  }
}
