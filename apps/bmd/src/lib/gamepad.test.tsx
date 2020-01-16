import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'

import App from '../App'

import { advanceTimers, getNewVoterCard } from '../../test/helpers/smartcards'

import {
  contest0,
  contest0candidate0,
  contest0candidate1,
  contest1candidate0,
  setElectionInStorage,
  setStateInStorage,
} from '../../test/helpers/election'

import { getActiveElement, handleGamepadButtonDown } from './gamepad'
import { MemoryStorage } from '../utils/Storage'
import { AppStorage } from '../AppRoot'
import { MemoryCard } from '../utils/Card'
import { MemoryHardware } from '../utils/Hardware'

beforeEach(() => {
  window.location.href = '/'
})

it('gamepad controls work', async () => {
  jest.useFakeTimers()

  const card = new MemoryCard()
  const hardware = new MemoryHardware()
  const storage = new MemoryStorage<AppStorage>()
  setElectionInStorage(storage)
  setStateInStorage(storage)
  const { getByText } = render(
    <App card={card} hardware={hardware} storage={storage} />
  )

  card.insertCard(getNewVoterCard())
  advanceTimers()
  await wait(() => getByText(/Center Springfield/))

  // Go to First Contest
  handleGamepadButtonDown('DPadRight')
  advanceTimers()

  // First Contest Page
  getByText(contest0.title)

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
  advanceTimers()
  // go up first without focus, then down once, should be same as down once.
  handleGamepadButtonDown('DPadUp')
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().dataset.choice).toEqual(contest1candidate0.id)
  handleGamepadButtonDown('DPadLeft')
  advanceTimers()
  // B is same as down
  handleGamepadButtonDown('B')
  expect(getActiveElement().dataset.choice).toEqual(contest0candidate0.id)

  // select and unselect
  handleGamepadButtonDown('A')
  expect(getActiveElement().dataset.selected).toBe('true')
  handleGamepadButtonDown('A')
  expect(getActiveElement().dataset.selected).toBe('false')

  // Confirm 'Okay' is only active element on page. Modal is "true" modal.
  fireEvent.click(getByText(contest0candidate0.name))
  fireEvent.click(getByText(contest0candidate1.name))
  handleGamepadButtonDown('DPadDown') // selects Okay button
  handleGamepadButtonDown('DPadDown') // Okay button should still be selected
  handleGamepadButtonDown('DPadDown') // Okay button should still be selected
  expect(getActiveElement().textContent).toBe('Okay')
})
