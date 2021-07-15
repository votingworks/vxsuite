import { z } from 'zod'
import { useState, Dispatch, SetStateAction } from 'react'
import { Optional, safeParseJSON } from '@votingworks/types'

function useStateWithLocalStorage<S>(
  key: string,
  schema: z.ZodSchema<S>
): [Optional<S>, Dispatch<SetStateAction<Optional<S>>>]
function useStateWithLocalStorage<S>(
  key: string,
  schema: z.ZodSchema<S>,
  initialValue: S
): [S, Dispatch<SetStateAction<S>>]
function useStateWithLocalStorage<S>(
  key: string,
  schema: z.ZodSchema<S>,
  initialValue?: S
): [Optional<S>, Dispatch<SetStateAction<Optional<S>>>] {
  const [item, setInnerValue] = useState<Optional<S>>(() => {
    const valueItem = window.localStorage.getItem(key)
    return valueItem
      ? safeParseJSON(valueItem, schema).unsafeUnwrap()
      : initialValue
  })

  const setValue = (
    value: SetStateAction<Optional<S>>
  ): SetStateAction<Optional<S>> => {
    const valueToStore = value instanceof Function ? value(item) : value
    setInnerValue(valueToStore)
    if (valueToStore) {
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
    } else {
      window.localStorage.removeItem(key)
    }
    return value
  }

  return [item, setValue]
}

export default useStateWithLocalStorage
