export default class Map2d<K1, K2, T> {
  private k1Map = new Map<K1, Map<K2, T>>()

  public constructor(iterable?: Iterable<[K1, K2, T]>) {
    if (iterable) {
      for (const [k1, k2, value] of iterable) {
        this.set(k1, k2, value)
      }
    }
  }

  public has(k1: K1, k2: K2): boolean {
    return this.k1Map.get(k1)?.has(k2) || false
  }

  public get(k1: K1, k2: K2): T | undefined {
    return this.k1Map.get(k1)?.get(k2)
  }

  public set(k1: K1, k2: K2, value: T): this {
    let k2Map = this.k1Map.get(k1)

    if (!k2Map) {
      k2Map = new Map<K2, T>()
      this.k1Map.set(k1, k2Map)
    }

    k2Map.set(k2, value)
    return this
  }

  public delete(k1: K1, k2: K2): boolean {
    const k2Map = this.k1Map.get(k1)

    if (!k2Map) {
      return false
    }

    return k2Map.delete(k2)
  }

  public filter(
    predicate: (k1: K1, k2: K2, value: T) => boolean
  ): Map2d<K1, K2, T> {
    const result = new Map2d<K1, K2, T>()

    for (const [k1, k2, value] of this) {
      if (predicate(k1, k2, value)) {
        result.set(k1, k2, value)
      }
    }

    return result
  }

  public *[Symbol.iterator](): IterableIterator<[K1, K2, T]> {
    for (const [k1, k2Map] of this.k1Map) {
      for (const [k2, value] of k2Map) {
        yield [k1, k2, value]
      }
    }
  }

  public *values(): IterableIterator<T> {
    for (const k2Map of this.k1Map.values()) {
      yield* k2Map.values()
    }
  }

  public *keys(): IterableIterator<[K1, K2]> {
    for (const [k1, k2Map] of this.k1Map) {
      for (const k2 of k2Map.keys()) {
        yield [k1, k2]
      }
    }
  }
}
