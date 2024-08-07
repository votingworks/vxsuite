import { deepEqual } from '@votingworks/basics';

/**
 * React Query allows passing a custom `structuralSharing` function to `useQuery`.
 * It allows us to compare the old and new data and keep the old data as the
 * query data if it is deep equal to the new data. As a result, we can maintain
 * the reference to the old data and prevent React from re-rendering components
 * that depend on it.
 */
export function persistDataReferenceIfDeepEqual<T>(
  oldData: T | undefined,
  newData: T
): T {
  if (!oldData) {
    return newData;
  }

  // Prevent unnecessary re-renders of dependent components
  const isUnchanged = deepEqual(oldData, newData);
  return isUnchanged ? oldData : newData;
}
