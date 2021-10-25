import { Storage } from '../types';

/**
 * Implements the storage API for storing objects in memory. Data stored in
 * this object only lasts as long as the program runs.
 */
export default class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  /**
   * @param initial data to load into storage
   */
  constructor(initial?: Record<string, unknown>) {
    if (initial) {
      for (const key of Object.keys(initial)) {
        void this.set(key, initial[key]);
      }
    }
  }

  /**
   * Gets an object from storage by key.
   */
  async get(key: string): Promise<unknown> {
    const serialized = this.data.get(key);

    if (typeof serialized === 'undefined') {
      return serialized;
    }

    return JSON.parse(serialized);
  }

  /**
   * Sets an object in storage by key.
   */
  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, JSON.stringify(value));
  }

  /**
   * Removes an object in storage by key.
   */
  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  /**
   * Clears all objects out of storage.
   */
  async clear(): Promise<void> {
    this.data.clear();
  }
}
