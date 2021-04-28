import { strict as assert } from 'assert'

/**
 * Describes the API for application-level persistant storage. Values must be
 * objects that can be persisted via JSON.stringify and JSON.parse.
 */
export interface Storage {
  /**
   * Gets an object from storage by key.
   */
  get(key: string): Promise<unknown>

  /**
   * Sets an object in storage by key.
   */
  set(key: string, value: unknown): Promise<void>

  /**
   * Removes an object in storage by key.
   */
  remove(key: unknown): Promise<void>

  /**
   * Clears all objects out of storage.
   */
  clear(): Promise<void>
}

/**
 * Implements the storage API using `localStorage` as the backing store.
 */
export class LocalStorage implements Storage {
  /**
   * Gets an object from storage by key.
   */
  public async get(key: string): Promise<unknown> {
    assert(typeof key === 'string')
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : undefined
  }

  /**
   * Sets an object in storage by key.
   */
  public async set(key: string, value: unknown): Promise<void> {
    assert(typeof key === 'string')
    window.localStorage.setItem(key, JSON.stringify(value))
  }

  /**
   * Removes an object in storage by key.
   */
  public async remove(key: string): Promise<void> {
    assert(typeof key === 'string')
    window.localStorage.removeItem(key)
  }

  /**
   * Clears all objects out of storage.
   */
  public async clear(): Promise<void> {
    window.localStorage.clear()
  }
}

/**
 * Implements the storage API using Kiosk Storage as the backing store.
 */
export class KioskStorage implements Storage {
  /**
   * Gets an object from storage by key.
   */
  public async get(key: string): Promise<unknown> {
    assert(typeof key === 'string')
    return window.kiosk!.storage.get(key)
  }

  /**
   * Sets an object in storage by key.
   */
  public async set(key: string, value: unknown): Promise<void> {
    assert(typeof key === 'string')
    await window.kiosk!.storage.set(key, value)
  }

  /**
   * Removes an object in storage by key.
   */
  public async remove(key: string): Promise<void> {
    assert(typeof key === 'string')
    await window.kiosk!.storage.remove(key)
  }

  /**
   * Clears all objects out of storage.
   */
  public async clear(): Promise<void> {
    await window.kiosk!.storage.clear()
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
  public async get(key: string): Promise<unknown> {
    const serialized = this.data.get(key)

    if (typeof serialized === 'undefined') {
      return serialized
    }

    return JSON.parse(serialized)
  }

  /**
   * Sets an object in storage by key.
   */
  public async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, JSON.stringify(value))
  }

  /**
   * Removes an object in storage by key.
   */
  public async remove(key: string): Promise<void> {
    this.data.delete(key)
  }

  /**
   * Clears all objects out of storage.
   */
  public async clear(): Promise<void> {
    this.data.clear()
  }
}
