import { Optional, safeParse } from '@votingworks/types'
import { Storage } from '@votingworks/utils'
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { z } from 'zod'

/**
 * Store a value in `storage` by `key`, validating it using `schema` without
 * an initial default value.
 */
export function useStoredState<S>(
  storage: Storage,
  key: string,
  schema: z.ZodSchema<S>
): [Optional<S>, Dispatch<SetStateAction<Optional<S>>>]
/**
 * Store a value in `storage` by `key`, validating it using `schema`, using
 * `initialValue` if the value is absent from `storage`.
 */
export function useStoredState<S>(
  storage: Storage,
  key: string,
  schema: z.ZodSchema<S>,
  initialValue: S
): [S, Dispatch<SetStateAction<S>>]
export function useStoredState<S>(
  storage: Storage,
  key: string,
  schema: z.ZodSchema<S>,
  initialValue?: S
): [Optional<S>, Dispatch<SetStateAction<Optional<S>>>] {
  const [item, setInnerValue] = useState<Optional<S>>(initialValue)

  useEffect(() => {
    void (async () => {
      const valueItem = await storage.get(key)
      if (typeof valueItem !== 'undefined') {
        setInnerValue(safeParse(schema, valueItem).unsafeUnwrap())
      }
    })()
  }, [key, schema, storage])

  const setValue = useCallback(
    (value: SetStateAction<Optional<S>>): SetStateAction<Optional<S>> => {
      const valueToStore = value instanceof Function ? value(item) : value
      setInnerValue(valueToStore)
      if (valueToStore) {
        void storage.set(key, valueToStore)
      } else {
        void storage.remove(key)
      }
      return value
    },
    [item, key, storage]
  )

  return [item, setValue]
}
