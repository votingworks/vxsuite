export class KeyedMap<Key, Value, ResolvedKey = string> {
  private readonly map = new Map<ResolvedKey, Value>();

  constructor(private readonly resolveKey: (key: Key) => ResolvedKey) {}

  has(key: Key): boolean {
    return this.map.has(this.resolveKey(key));
  }

  get(key: Key): Value | undefined {
    return this.map.get(this.resolveKey(key));
  }

  set(key: Key, value: Value): this {
    this.map.set(this.resolveKey(key), value);
    return this;
  }

  delete(key: Key): boolean {
    return this.map.delete(this.resolveKey(key));
  }
}
