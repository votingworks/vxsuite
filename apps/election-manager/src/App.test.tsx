import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import fakeKiosk from '../test/helpers/fakeKiosk'

import App from './App'

beforeEach(() => {
  // we don't care about network errors logged to the console, they're crowding things
  jest.spyOn(console, 'error').mockImplementation(() => {}) // eslint-disable-line @typescript-eslint/no-empty-function

  window.location.href = '/'
  window.kiosk = fakeKiosk()
})

it('basic navigation works', async () => {
  const { getByText } = render(<App />)

  await screen.findByText('Create New Election Definition')

  fireEvent.click(getByText('Create New Election Definition'))

  // go print some ballots
  fireEvent.click(getByText('Ballots'))

  fireEvent.click(getByText('Export Ballot Package'))
  expect(window.kiosk?.saveAs).toHaveBeenCalledTimes(1)

  // we're not mocking the filestream yet
  await screen.findByText('Download Failed')

  // first ballot -- FIXME: i18n making this fail right now
  // fireEvent.click(getAllByText('View Ballot')[0])
  // fireEvent.click(getByText('English/Spanish'))

  fireEvent.click(getByText('Tally'))
  fireEvent.click(getByText('Definition'))
  fireEvent.click(getByText('JSON Editor'))

  // remove the election
  fireEvent.click(getByText('Remove'))
  fireEvent.click(getByText('Remove Election Definition'))

  await screen.findByText('Configure Election Manager')
})
