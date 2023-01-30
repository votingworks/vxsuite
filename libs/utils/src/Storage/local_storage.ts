import { assert } from '@votingworks/basics';
import { Storage } from '../types';

/* eslint-disable @typescript-eslint/require-await */

/**
 * Implements the storage API using `localStorage` as the backing store.
 */
export class LocalStorage implements Storage {
  /**
   * Gets an object from storage by key.
   */
  async get(key: string): Promise<unknown> {
    assert(typeof key === 'string');
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : undefined;
  }

  /**
   * Sets an object in storage by key.
   */
  async set(key: string, value: unknown): Promise<void> {
    assert(typeof key === 'string');
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  /**
   * Removes an object in storage by key.
   */
  async remove(key: string): Promise<void> {
    assert(typeof key === 'string');
    window.localStorage.removeItem(key);
  }

  /**
   * Clears all objects out of storage.
   */
  async clear(): Promise<void> {
    window.localStorage.clear();
  }
}
