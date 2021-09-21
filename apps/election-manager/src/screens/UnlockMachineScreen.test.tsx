import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import renderInAppContext from '../../test/renderInAppContext'
import { UnlockMachineScreen } from './UnlockMachineScreen'

test('authentication', async () => {
  const attemptToAuthenticateUser = jest.fn()

  renderInAppContext(<UnlockMachineScreen />, { attemptToAuthenticateUser })
  screen.getByText('- - - - - -')

  // set up a failed attempt
  attemptToAuthenticateUser.mockReturnValueOnce(false)

  userEvent.click(screen.getByText('0'))
  screen.getByText('• - - - - -')

  userEvent.click(screen.getByText('✖'))
  screen.getByText('- - - - - -')

  userEvent.click(screen.getByText('0'))
  screen.getByText('• - - - - -')

  userEvent.click(screen.getByText('1'))
  screen.getByText('• • - - - -')

  userEvent.click(screen.getByText('2'))
  screen.getByText('• • • - - -')

  userEvent.click(screen.getByText('3'))
  screen.getByText('• • • • - -')

  userEvent.click(screen.getByText('4'))
  screen.getByText('• • • • • -')

  userEvent.click(screen.getByText('⌫'))
  screen.getByText('• • • • - -')

  userEvent.click(screen.getByText('4'))
  screen.getByText('• • • • • -')

  userEvent.click(screen.getByText('5'))
  screen.getByText('• • • • • •')

  await waitFor(() =>
    expect(attemptToAuthenticateUser).toHaveBeenNthCalledWith(1, '012345')
  )

  screen.getByText('Invalid code. Please try again.')

  // set up a successful attempt
  attemptToAuthenticateUser.mockReturnValueOnce(true)

  for (let i = 0; i < 6; i += 1) {
    userEvent.click(screen.getByText('0'))
  }

  await waitFor(() =>
    expect(attemptToAuthenticateUser).toHaveBeenNthCalledWith(2, '000000')
  )

  expect(screen.queryByText('Invalid code. Please try again.')).toBeNull()
})

test('factory reset', async () => {
  const attemptToAuthenticateUser = jest.fn()
  const saveElection = jest.fn()

  renderInAppContext(<UnlockMachineScreen />, {
    attemptToAuthenticateUser,
    saveElection,
  })

  attemptToAuthenticateUser.mockReturnValueOnce(false)

  userEvent.click(screen.getByText('3'))
  userEvent.click(screen.getByText('1'))
  userEvent.click(screen.getByText('4'))
  userEvent.click(screen.getByText('1'))
  userEvent.click(screen.getByText('5'))
  userEvent.click(screen.getByText('9'))

  await waitFor(() =>
    expect(attemptToAuthenticateUser).toHaveBeenNthCalledWith(1, '314159')
  )

  userEvent.click(screen.getByText('Factory Reset'))
  expect(saveElection).toHaveBeenCalledWith(undefined)
})
