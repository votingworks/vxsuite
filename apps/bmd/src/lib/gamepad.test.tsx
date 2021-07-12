import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils'
import App from '../App'

import {
  advanceTimersAndPromises,
  getNewVoterCard,
} from '../../test/helpers/smartcards'

import {
  contest0,
  contest0candidate0,
  contest0candidate1,
  contest1candidate0,
  setElectionInStorage,
  setStateInStorage,
} from '../../test/helpers/election'

import { getActiveElement, handleGamepadButtonDown } from './gamepad'
import { fakeMachineConfigProvider } from '../../test/helpers/fakeMachineConfig'

beforeEach(() => {
  window.location.href = '/'
})

it('gamepad controls work', async () => {
  jest.useFakeTimers()

  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider()

  await setElectionInStorage(storage)
  await setStateInStorage(storage)

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  )
  await advanceTimersAndPromises()

  card.insertCard(getNewVoterCard())
  await advanceTimersAndPromises()
  screen.getByText(/Center Springfield/)

  // Go to First Contest
  handleGamepadButtonDown('DPadRight')
  await advanceTimersAndPromises()

  // First Contest Page
  screen.getByText(contest0.title)

  // Confirm first contest only has 1 seat
  expect(contest0.seats).toEqual(1)

  // Test navigation by gamepad
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().dataset.choice).toEqual(contest0candidate0.id)
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().dataset.choice).toEqual(contest0candidate1.id)
  handleGamepadButtonDown('DPadUp')
  expect(getActiveElement().dataset.choice).toEqual(contest0candidate0.id)

  // test the edge case of rolling over
  handleGamepadButtonDown('DPadUp')
  expect(document.activeElement!.textContent).toEqual('Back')
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().dataset.choice).toEqual(contest0candidate0.id)

  handleGamepadButtonDown('DPadRight')
  await advanceTimersAndPromises()
  // go up first without focus, then down once, should be same as down once.
  handleGamepadButtonDown('DPadUp')
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().dataset.choice).toEqual(contest1candidate0.id)
  handleGamepadButtonDown('DPadLeft')
  await advanceTimersAndPromises()
  // B is same as down
  handleGamepadButtonDown('B')
  expect(getActiveElement().dataset.choice).toEqual(contest0candidate0.id)

  // select and unselect
  handleGamepadButtonDown('A')
  await advanceTimersAndPromises()
  expect(getActiveElement().dataset.selected).toBe('true')
  handleGamepadButtonDown('A')
  await advanceTimersAndPromises()
  expect(getActiveElement().dataset.selected).toBe('false')

  // Confirm 'Okay' is only active element on page. Modal is "true" modal.
  fireEvent.click(screen.getByText(contest0candidate0.name))
  fireEvent.click(screen.getByText(contest0candidate1.name))
  handleGamepadButtonDown('DPadDown') // selects Okay button
  handleGamepadButtonDown('DPadDown') // Okay button should still be selected
  handleGamepadButtonDown('DPadDown') // Okay button should still be selected
  expect(getActiveElement().textContent).toBe('Okay')

  await advanceTimersAndPromises()
})
