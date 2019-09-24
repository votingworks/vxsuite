import React from 'react'
import { render, fireEvent } from '@testing-library/react'

import SettingsTextSize from './SettingsTextSize'
import { UserSettings } from '../config/types'

const userSettings: UserSettings = {
  textSize: 1,
}
const setUserSettings = jest.fn()

it('renders SettingsTextSize', () => {
  const { container, getAllByText } = render(
    <SettingsTextSize
      userSettings={userSettings}
      setUserSettings={setUserSettings}
    />
  )
  expect(container.firstChild).toMatchSnapshot()
  const buttons = getAllByText('A')
  expect(buttons.length).toBe(3)
  fireEvent.click(buttons[0])
  expect(setUserSettings).toBeCalledWith({ textSize: 0 })
  fireEvent.click(buttons[1])
  expect(setUserSettings).toBeCalledWith({ textSize: 1 })
  fireEvent.click(buttons[2])
  expect(setUserSettings).toBeCalledWith({ textSize: 2 })
})
