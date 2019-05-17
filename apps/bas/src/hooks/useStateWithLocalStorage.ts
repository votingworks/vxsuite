import { useState, Dispatch, SetStateAction } from 'react'

const useStateWithLocalStorage = <S>(
  key: string,
  initialValue?: S
): [S, Dispatch<SetStateAction<S>>] => {
  const [item, setInnerValue] = useState<S>(() => {
    const valueItem = window.localStorage.getItem(key)
    return valueItem ? JSON.parse(valueItem) : initialValue
  })

  const setValue = (value: SetStateAction<S>): SetStateAction<S> => {
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
