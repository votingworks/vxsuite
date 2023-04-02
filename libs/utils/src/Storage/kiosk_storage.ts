import { assert } from '@votingworks/basics';
import { Storage } from '../types';

/**
 * Implements the storage API using Kiosk Storage as the backing store.
 *
 * @deprecated app backends should manage their own storage.
 */
export class KioskStorage implements Storage {
  constructor(private readonly kiosk: KioskBrowser.Kiosk) {
    assert(kiosk);
  }

  /**
   * Gets an object from storage by key.
   */
  async get(key: string): Promise<unknown> {
    assert(typeof key === 'string');
    return this.kiosk.storage.get(key);
  }

  /**
   * Sets an object in storage by key.
   */
  async set(key: string, value: unknown): Promise<void> {
    assert(typeof key === 'string');
    await this.kiosk.storage.set(key, value);
  }

  /**
   * Removes an object in storage by key.
   */
  async remove(key: string): Promise<void> {
    assert(typeof key === 'string');
    await this.kiosk.storage.remove(key);
  }

  /**
   * Clears all objects out of storage.
   */
  async clear(): Promise<void> {
    await this.kiosk.storage.clear();
  }
}
