import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryStorage } from '@votingworks/utils/src'
import React, { useCallback } from 'react'
import { z } from 'zod'
import { Button } from '../Button'
import { useStoredState } from './useStoredState'

test('no initial value + updates', async () => {
  const storage = new MemoryStorage()

  const TestComponent = (): JSX.Element => {
    const [number, setNumber] = useStoredState(storage, 'test-key', z.number())

    const reset = useCallback(() => {
      setNumber(0)
    }, [setNumber])

    const increment = useCallback(() => {
      setNumber((prev = 0) => prev + 1)
    }, [setNumber])

    return (
      <div>
        <span>{typeof number}</span> <span>{number}</span>
        <Button onPress={reset}>Reset</Button>
        <Button onPress={increment}>Increment</Button>
      </div>
    )
  }

  render(<TestComponent />)
  screen.getByText('undefined')

  userEvent.click(screen.getByText('Reset'))
  screen.getByText('number')
  screen.getByText('0')

  userEvent.click(screen.getByText('Increment'))
  await waitFor(() => screen.getByText('number'))
  screen.getByText('1')

  userEvent.click(screen.getByText('Increment'))
  await waitFor(() => screen.getByText('number'))
  screen.getByText('2')
})

test('has initial value + updates', async () => {
  const storage = new MemoryStorage()

  const TestComponent = (): JSX.Element => {
    const [boolean, setBoolean] = useStoredState(
      storage,
      'test-key',
      z.boolean(),
      false
    )

    const negate = useCallback(() => {
      setBoolean((prev) => !prev)
    }, [setBoolean])

    return (
      <div>
        <span>{typeof boolean}</span> <span>{boolean ? 'yes' : 'no'}</span>
        <Button onPress={negate}>Negate</Button>
      </div>
    )
  }

  render(<TestComponent />)
  await waitFor(() => screen.getByText('boolean'))
  screen.getByText('no')

  userEvent.click(screen.getByText('Negate'))
  await waitFor(() => screen.getByText('yes'))

  userEvent.click(screen.getByText('Negate'))
  await waitFor(() => screen.getByText('no'))
})

test('restores complex object', async () => {
  const storage = new MemoryStorage()
  const schema = z.object({
    a: z.number(),
    b: z.boolean(),
    c: z.array(z.number()),
  })
  const value: z.TypeOf<typeof schema> = {
    a: 1,
    b: true,
    c: [99],
  }

  await storage.set('test-key', value)

  const TestComponent = (): JSX.Element => {
    const [storedValue] = useStoredState(storage, 'test-key', schema)

    try {
      expect(storedValue).toEqual(value)
      return <div>yes</div>
    } catch (error) {
      return <div>no: {error.message}</div>
    }
  }

  render(<TestComponent />)
  await waitFor(() => screen.getByText('yes'))
})
