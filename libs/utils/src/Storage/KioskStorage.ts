import { strict as assert } from 'assert'
import { Storage } from '../types'

/**
 * Implements the storage API using Kiosk Storage as the backing store.
 */
export default class KioskStorage implements Storage {
  /**
   * Gets an object from storage by key.
   */
  async get(key: string): Promise<unknown> {
    assert(typeof key === 'string')
    assert(window.kiosk)
    return window.kiosk.storage.get(key)
  }

  /**
   * Sets an object in storage by key.
   */
  async set(key: string, value: unknown): Promise<void> {
    assert(typeof key === 'string')
    assert(window.kiosk)
    await window.kiosk.storage.set(key, value)
  }

  /**
   * Removes an object in storage by key.
   */
  async remove(key: string): Promise<void> {
    assert(typeof key === 'string')
    assert(window.kiosk)
    await window.kiosk.storage.remove(key)
  }

  /**
   * Clears all objects out of storage.
   */
  async clear(): Promise<void> {
    assert(window.kiosk)
    await window.kiosk.storage.clear()
  }
}
