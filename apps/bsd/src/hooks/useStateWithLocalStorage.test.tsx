import React, { useCallback } from 'react'
import { render } from '@testing-library/react'
import useStateWithLocalStorage from './useStateWithLocalStorage'

function Example({ initialValue }: { initialValue?: string }): JSX.Element {
  const [value, setValue] = useStateWithLocalStorage('key', initialValue)

  const reverseValue = useCallback(() => {
    setValue((v) => v.split('').reverse().join(''))
  }, [setValue])

  const clearValue = useCallback(() => {
    setValue('')
  }, [setValue])

  return (
    <div>
      Value: {value}
      <button type="button" onClick={reverseValue}>
        Reverse value
      </button>
      <button type="button" onClick={clearValue}>
        Clear value
      </button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

test('uses the initial value if nothing is in local storage', () => {
  const component = render(<Example initialValue="abc" />)
  expect(component.getByText(/abc/)).toBeDefined()
})

test('uses the stored value if present', () => {
  localStorage.setItem('key', JSON.stringify('stored value'))
  const component = render(<Example initialValue="abc" />)
  expect(component.getByText(/stored value/)).toBeDefined()
})

test('stores updated values in local storage', () => {
  const component = render(<Example initialValue="abc" />)
  component.getByText('Reverse value').click()
  expect(localStorage.getItem('key')).toEqual(JSON.stringify('cba'))
})

test('clears value when setting to a falsy value', () => {
  const component = render(<Example initialValue="abc" />)
  component.getByText('Clear value').click()
  expect(localStorage.length).toEqual(0)
})
