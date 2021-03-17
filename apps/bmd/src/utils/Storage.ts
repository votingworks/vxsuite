import { strict as assert } from 'assert'

/**
 * Describes the API for application-level persistant storage. Values must be
 * objects that can be persisted via JSON.stringify and JSON.parse.
 */
export interface Storage {
  /**
   * Gets an object from storage by key.
   */
  get(key: string): unknown | undefined

  /**
   * Sets an object in storage by key.
   */
  set(key: string, value: unknown): void

  /**
   * Removes an object in storage by key.
   */
  remove(key: string): void

  /**
   * Clears all objects out of storage.
   */
  clear(): void
}

/**
 * Implements the storage API using `localStorage` as the backing store.
 */
export class LocalStorage implements Storage {
  /**
   * Gets an object from storage by key.
   */
  public get(key: string): unknown | undefined {
    assert(typeof key === 'string')
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : undefined
  }

  /**
   * Sets an object in storage by key.
   */
  public set(key: string, value: unknown): void {
    assert(typeof key === 'string')
    window.localStorage.setItem(key, JSON.stringify(value))
  }

  /**
   * Removes an object in storage by key.
   */
  public remove(key: string): void {
    assert(typeof key === 'string')
    window.localStorage.removeItem(key)
  }

  /**
   * Clears all objects out of storage.
   */
  public clear(): void {
    window.localStorage.clear()
  }
}

/**
 * Implements the storage API for storing objects in memory. Data stored in
 * this object only lasts as long as the program runs.
 */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  /**
   * @param initial data to load into storage
   */
  public constructor(initial?: Record<string, unknown>) {
    if (initial) {
      for (const key in initial) {
        /* istanbul ignore else */
        if (Object.prototype.hasOwnProperty.call(initial, key)) {
          this.set(key, initial[key])
        }
      }
    }
  }

  /**
   * Gets an object from storage by key.
   */
  public get(key: string): unknown | undefined {
    const serialized = this.data.get(key)

    if (typeof serialized === 'undefined') {
      return serialized
    }

    return JSON.parse(serialized)
  }

  /**
   * Sets an object in storage by key.
   */
  public set(key: string, value: unknown): void {
    this.data.set(key, JSON.stringify(value))
  }

  /**
   * Removes an object in storage by key.
   */
  public remove(key: string): void {
    this.data.delete(key)
  }

  /**
   * Clears all objects out of storage.
   */
  public clear(): void {
    this.data.clear()
  }
}
