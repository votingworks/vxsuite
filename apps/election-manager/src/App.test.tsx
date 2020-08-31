import React from 'react'

import { fireEvent, render, screen } from '@testing-library/react'
import { Election } from '@votingworks/ballot-encoder'
import { MemoryStorage } from './utils/Storage'
import {
  AppStorage,
  electionStorageKey,
  configuredAtStorageKey,
} from './AppRoot'

import fakeKiosk from '../test/helpers/fakeKiosk'

import App from './App'

import sleep from './utils/sleep'

import eitherNeitherElectionUntyped from '../test/fixtures/eitherneither-election.json'

const eitherNeitherElection = (eitherNeitherElectionUntyped as unknown) as Election

jest.mock('./components/HandMarkedPaperBallot')

beforeEach(() => {
  // we don't care about network errors logged to the console, they're crowding things
  jest.spyOn(console, 'error').mockImplementation(() => {}) // eslint-disable-line @typescript-eslint/no-empty-function

  window.location.href = '/'
  window.kiosk = fakeKiosk()
})

it('create election works', async () => {
  const { getByText, getAllByText } = render(<App />)

  await screen.findByText('Create New Election Definition')
  fireEvent.click(getByText('Create New Election Definition'))
  await screen.findByText('Ballots')

  fireEvent.click(getByText('Ballots'))
  fireEvent.click(getAllByText('View Ballot')[0])
  fireEvent.click(getByText('English/Spanish'))
})

it('basic navigation works', async () => {
  // mock the election we want
  const storage = new MemoryStorage<AppStorage>()
  await storage.set(electionStorageKey, eitherNeitherElection)
  await storage.set(configuredAtStorageKey, new Date().toISOString())
  const { container, getByText, getAllByText, queryAllByText } = render(
    <App storage={storage} />
  )

  await screen.findByText('0 official ballots')

  // go print some ballots
  fireEvent.click(getByText('Export Ballot Package'))
  expect(window.kiosk?.saveAs).toHaveBeenCalledTimes(1)

  // we're not mocking the filestream yet
  await screen.findByText('Download Failed')

  fireEvent.click(getByText('Ballots'))
  fireEvent.click(getAllByText('View Ballot')[0])
  fireEvent.click(getByText('Precinct'))
  fireEvent.click(getByText('Absentee'))
  fireEvent.click(getByText('Test'))
  fireEvent.click(getByText('Official'))
  fireEvent.click(getByText('Print 1 Official', { exact: false }))
  expect(window.kiosk?.print).toHaveBeenCalledTimes(1)

  // this is ugly but necessary for now to wait just a bit for the data to be stored
  await sleep(0)

  fireEvent.click(getByText('Ballots'))
  getByText('1 official ballot', { exact: false })
  fireEvent.click(getByText('Printed Ballots Report'))
  fireEvent.click(queryAllByText('Print Report')[0])
  expect(window.kiosk?.print).toHaveBeenCalledTimes(2)

  fireEvent.click(getByText('Tally'))
  fireEvent.click(getByText('Print Test Decks'))
  getByText('Chester')
  getByText('District 5')
  fireEvent.click(getByText('All Precincts'))
  await screen.findByText('Generating Test Deck...')

  await screen.findByText('Print Test Deck')
  fireEvent.click(getByText('Print Test Deck'))
  expect(container).toMatchSnapshot()
  expect(window.kiosk?.print).toHaveBeenCalledTimes(3)

  fireEvent.click(getByText('Tally'))
  fireEvent.click(getByText('View Test Ballot Deck Tally'))
  fireEvent.click(getByText('All Precincts'))
  await screen.findByText('Print Results Report')
  expect(container).toMatchSnapshot()
  fireEvent.click(getByText('Print Results Report'))
  expect(window.kiosk?.print).toHaveBeenCalledTimes(4)

  fireEvent.click(getByText('Definition'))
  fireEvent.click(getByText('JSON Editor'))

  // remove the election
  fireEvent.click(getByText('Remove'))
  fireEvent.click(getByText('Remove Election Definition'))

  await screen.findByText('Configure Election Manager')
})
