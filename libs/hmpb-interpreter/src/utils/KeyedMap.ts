export default class KeyedMap<Key, Value, ResolvedKey = string> {
  private map = new Map<ResolvedKey, Value>()

  public constructor(private resolveKey: (key: Key) => ResolvedKey) {}

  public has(key: Key): boolean {
    return this.map.has(this.resolveKey(key))
  }

  public get(key: Key): Value | undefined {
    return this.map.get(this.resolveKey(key))
  }

  public set(key: Key, value: Value): this {
    this.map.set(this.resolveKey(key), value)
    return this
  }

  public delete(key: Key): boolean {
    return this.map.delete(this.resolveKey(key))
  }
}
