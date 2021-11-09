import { Optional, safeParse } from '@votingworks/types';
import { Storage } from '@votingworks/utils';
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { z } from 'zod';
import { useCancelablePromise } from './use_cancelable_promise';

/**
 * Store a value in `storage` by `key`, validating it using `schema` without
 * an initial default value.
 */
export function useStoredState<S>(
  storage: Storage,
  key: string,
  schema: z.ZodSchema<S>
): [Optional<S>, Dispatch<SetStateAction<Optional<S>>>];
/**
 * Store a value in `storage` by `key`, validating it using `schema`, using
 * `initialValue` if the value is absent from `storage`.
 */
export function useStoredState<S>(
  storage: Storage,
  key: string,
  schema: z.ZodSchema<S>,
  initialValue: S
): [S, Dispatch<SetStateAction<S>>];
export function useStoredState<S>(
  storage: Storage,
  key: string,
  schema: z.ZodSchema<S>,
  initialValue?: S
): [Optional<S>, Dispatch<SetStateAction<Optional<S>>>] {
  const [innerValue, setInnerValue] = useState<Optional<S>>(initialValue);
  const makeCancelable = useCancelablePromise();

  useEffect(() => {
    void (async () => {
      const valueItem = await makeCancelable(storage.get(key));
      setInnerValue((prev) =>
        typeof valueItem !== 'undefined'
          ? safeParse(schema, valueItem).unsafeUnwrap()
          : prev
      );
    })();
  }, [key, makeCancelable, schema, storage]);

  const setValue = useCallback(
    (value: SetStateAction<Optional<S>>): void =>
      setInnerValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value;
        if (typeof valueToStore !== 'undefined') {
          void storage.set(key, valueToStore);
        } else {
          void storage.remove(key);
        }
        return valueToStore;
      }),
    [key, storage]
  );

  return [innerValue, setValue];
}
