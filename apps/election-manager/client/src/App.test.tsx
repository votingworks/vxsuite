import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import App from './App'

beforeEach(() => {
  window.location.href = '/'
})

it('basic navigation works', async () => {
  render(<App />)

  fireEvent.click(await screen.findByText('Create New Election Definition'))

  // navigate a bit
  fireEvent.click(await screen.findByText('Ballots'))
  fireEvent.click(await screen.findByText('Tally'))
  fireEvent.click(await screen.findByText('Definition'))

  // remove the election
  fireEvent.click(await screen.findByText('Remove'))
  fireEvent.click(await screen.findByText('Remove Election Definition'))

  await screen.findByText('Configure Election Manager')
})
