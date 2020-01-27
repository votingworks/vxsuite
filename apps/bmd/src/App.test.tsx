import * as React from 'react'
import { render } from '../test/testUtils'
import App from './App'
import fakeMachineId from '../test/helpers/fakeMachineId'

it('prevents context menus from appearing', () => {
  render(<App machineId={fakeMachineId()} />)

  const { oncontextmenu } = window

  if (oncontextmenu) {
    const event = new MouseEvent('contextmenu')

    jest.spyOn(event, 'preventDefault')
    oncontextmenu.call(window, event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  }
})
