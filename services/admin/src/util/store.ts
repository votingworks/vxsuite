/* istanbul ignore file */
import { Store } from '../store';

/**
 * Adds a CVR file to the store with default test data
 */
export function addTestCvrFile(store: Store): string {
  const id = store.addCvrFile(
    'abc',
    'cvrs.jsonl',
    '123',
    ['123', 'abc'],
    ['zoo'],
    false
  );
  return id;
}

/**
 * Adds a CVR to the store with default test data
 */
export function addTestCvr(
  store: Store,
  { ballotId = '123', data = 'testCvrData' } = {}
): string {
  const id = store.addCvr(ballotId, addTestCvrFile(store), data) as string;
  return id;
}
