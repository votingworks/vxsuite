import { useEffect, useRef } from 'react';
import deepEqual from 'deep-eql';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { UseQueryResult } from '@tanstack/react-query';

/**
 * Registers a handler that will be called whenever some external state changes
 * (based on a deep equality check).
 *
 * Think of this like an event listener for events that are triggered outside of
 * the on-screen UI (e.g. similar to how we can put an onChange handler on, say,
 * a button, for a user event that is triggered in the UI).
 *
 * @deprecated Move the external state to the backend and use the
 * useQueryChangeListener hook instead.
 */
export function useExternalStateChangeListener<State>(
  currentState: State,
  changeHandler: (
    newState: State,
    previousState?: State
  ) => void | Promise<void>
): void {
  const previousState = useRef<State>();

  useEffect(() => {
    if (!deepEqual(previousState.current, currentState)) {
      void changeHandler(currentState, previousState.current);
      previousState.current = currentState;
    }
  }, [currentState, changeHandler]);
}

/**
 * Registers a handler that will be called whenever the result of a useQuery
 * hook changes (based on a deep equality check).
 *
 * Think of this like an event listener for events that are triggered outside of
 * the on-screen UI (e.g. similar to how we can put an onChange handler on, say,
 * a button, for a user event that is triggered in the UI).
 *
 * It can be combined with the refetchInterval option of useQuery to make the
 * query poll for new data regularly.
 *
 * Example use cases:
 * - Playing a sound when the scanner accepts a ballot
 * - Redirecting to a new URL when a background task is complete
 */
export function useQueryChangeListener<Data>(
  query: UseQueryResult<Data>,
  changeHandler: (newData: Data, previousData?: Data) => void | Promise<void>
): void {
  const previousData = useRef<Data>();

  useEffect(() => {
    if (query.isSuccess && !deepEqual(previousData.current, query.data)) {
      void changeHandler(query.data, previousData.current);
      previousData.current = query.data;
    }
  }, [query.isSuccess, query.data, changeHandler]);
}
