import { strict as assert } from 'assert'
import { Storage } from '../types'

/**
 * Implements the storage API using `localStorage` as the backing store.
 */
export default class LocalStorage implements Storage {
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
