import { act, waitFor } from '@testing-library/react'

export const IDLE_TIMEOUT_SECONDS = 5 * 60 // 5 minute

export const advanceTimers = (seconds = 0): void => {
  const maxSeconds = IDLE_TIMEOUT_SECONDS
  if (seconds > maxSeconds) {
    throw new Error(`Seconds value should not be greater than ${maxSeconds}`)
  }
  act(() => {
    jest.advanceTimersByTime(seconds * 1000)
  })
}

export const advanceTimersAndPromises = async (seconds = 0): Promise<void> => {
  advanceTimers(seconds)
  await waitFor(() => {
    // Wait for promises.
  })
}
