/**
 * Maps composite keys to multiple values.
 */
export default class MultiMap<K extends string[] = string[], V = unknown> {
  private valueMap = new Map<string, Set<V>>()
  private keyMap = new Map<string, K>()

  /**
   * Determine the internal key from the composite `key`.
   */
  private valueMapKey(key: K): string {
    const result = key.join('\0')
    if (!this.keyMap.has(result)) {
      this.keyMap.set(result, key)
    }
    return result
  }

  /**
   * Gets all values for `key`.
   */
  public get(key: K): Set<V> | undefined {
    const valueMapKey = this.valueMapKey(key)
    const values = this.valueMap.get(valueMapKey)
    return values && new Set([...values])
  }

  /**
   * Adds `value` to the list of values for `key`.
   */
  public set(key: K, value: V): this {
    const valueMapKey = this.valueMapKey(key)
    this.valueMap.set(
      valueMapKey,
      (this.valueMap.get(valueMapKey) ?? new Set()).add(value)
    )
    return this
  }

  /**
   * Delete all values for `key`.
   */
  public delete(key: K): boolean

  /**
   * Delete a single value for `key`.
   */
  public delete(key: K, value: V): boolean

  public delete(key: K, value?: V): boolean {
    const valueMapKey = this.valueMapKey(key)
    if (typeof value === 'undefined') {
      return this.valueMap.delete(valueMapKey)
    } else {
      const set = this.valueMap.get(valueMapKey)
      return set?.delete(value) && set.size === 0
        ? this.valueMap.delete(valueMapKey)
        : false
    }
  }

  /**
   * Clear all entries.
   */
  public clear(): void {
    this.valueMap.clear()
  }

  /**
   * The number of unique keys.
   */
  public get size(): number {
    return this.valueMap.size
  }

  /**
   * The number of unique keys.
   */
  public get keySize(): number {
    return this.size
  }

  /**
   * The number of values in all keys.
   */
  public get valueSize(): number {
    return [...this.valueMap.values()].reduce(
      (size, values) => size + values.size,
      0
    )
  }

  /**
   * Iterates through keys/values in the order in which keys were added.
   */
  public *[Symbol.iterator](): Generator<[K, Set<V>]> {
    for (const [valueMapKey, values] of this.valueMap) {
      const key = this.keyMap.get(valueMapKey)
      yield [key!, new Set([...values!])]
    }
  }
}
