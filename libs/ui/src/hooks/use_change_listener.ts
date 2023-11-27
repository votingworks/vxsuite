import { useEffect, useRef } from 'react';
import deepEqual from 'deep-eql';
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

function identity<T>(value: T): T {
  return value;
}

/**
 * Callback for {@link useQueryChangeListener} when query data changes.
 */
export type UseChangeListenerChangeHandler<Data> = (
  newData: Data,
  previousData?: Data
) => void | Promise<void>;

/**
 * Selector for {@link useQueryChangeListener} to map query data to a different
 * type, typically to select a subset of the data.
 */
export type UseChangeListenerDataSelector<Data, SelectedData> = (
  data: Data
) => SelectedData;

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
  changeHandler: UseChangeListenerChangeHandler<Data>
): void;
/**
 * Registers a handler that will be called whenever the result of a useQuery
 * hook changes (based on a deep equality check of selected data).
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
export function useQueryChangeListener<Data, SelectedData>(
  query: UseQueryResult<Data>,
  select: UseChangeListenerDataSelector<Data, SelectedData>,
  changeHandler: UseChangeListenerChangeHandler<SelectedData>
): void;
/**
 * Registers a handler that will be called whenever the result of a useQuery
 * hook changes (based on a deep equality check with an optional selector).
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
export function useQueryChangeListener<Data, SelectedData = Data>(
  query: UseQueryResult<Data>,
  changeHandlerOrSelect:
    | UseChangeListenerChangeHandler<Data>
    | UseChangeListenerDataSelector<Data, SelectedData>,
  changeHandlerOrUndefined?: UseChangeListenerChangeHandler<SelectedData>
): void {
  const previousData = useRef<SelectedData>();
  const [select, changeHandler]: [
    UseChangeListenerDataSelector<Data, SelectedData>,
    UseChangeListenerChangeHandler<SelectedData>,
  ] = changeHandlerOrUndefined
    ? [changeHandlerOrSelect as never, changeHandlerOrUndefined]
    : [identity as never, changeHandlerOrSelect as never];

  useEffect(() => {
    if (!query.isSuccess) {
      return;
    }

    const selectedData = select(query.data);
    if (!deepEqual(previousData.current, selectedData)) {
      void changeHandler(selectedData, previousData.current);
      previousData.current = selectedData;
    }
  }, [query.isSuccess, query.data, changeHandler, select]);
}
