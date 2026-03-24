import type { FilterState, LogSelection } from './types';
import { EMPTY_FILTER_STATE } from './types';

const DB_NAME = 'vx-log-viewer';
const DB_VERSION = 1;
const STORE_NAME = 'state';
const STATE_KEY = 'current';

interface PersistedState {
  readonly zipData: ArrayBuffer;
  readonly zipFileName: string;
  readonly selection: LogSelection | null;
  readonly filterState: FilterState;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function persistState(state: PersistedState): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(state, STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPersistedState(): Promise<PersistedState | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(STATE_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function clearPersistedState(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface AppHistoryState {
  readonly selection: LogSelection | null;
  readonly filterState: FilterState;
  readonly scrollToLine: number | null;
}

export const INITIAL_HISTORY_STATE: AppHistoryState = {
  selection: null,
  filterState: EMPTY_FILTER_STATE,
  scrollToLine: null,
};
