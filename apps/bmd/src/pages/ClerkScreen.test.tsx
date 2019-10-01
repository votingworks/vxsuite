import React from 'react'
import { fireEvent } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import { render } from '../../test/testUtils'

import { election, defaultPrecinctId } from '../../test/helpers/election'

import { adminCard, advanceTimers, noCard } from '../../test/helpers/smartcards'

import ClerkScreen from './ClerkScreen'
import { VxPrintOnly } from '../config/types'

jest.useFakeTimers()

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

it('renders ClerkScreen', async () => {
  const { getByText } = render(
    <ClerkScreen
      appMode={VxPrintOnly}
      appPrecinctId={defaultPrecinctId}
      ballotsPrintedCount={0}
      election={election}
      fetchElection={jest.fn()}
      isFetchingElection={false}
      isLiveMode={false}
      setAppMode={jest.fn()}
      setAppPrecinctId={jest.fn()}
      toggleLiveMode={jest.fn()}
      unconfigure={jest.fn()}
    />
  )

  // Configure with Admin Card
  currentCard = adminCard
  advanceTimers()

  // View Test Ballot Decks
  fireEvent.click(getByText('View Test Ballot Decks'))
  fireEvent.click(getByText('Center Springfield'))

  // Back All Decks
  fireEvent.click(getByText('Back to Precincts List'))

  // Single Precinct
  fireEvent.click(getByText('North Springfield'))
  fireEvent.click(getByText('Back to Admin Dashboard'))

  // All Precincts
  fireEvent.click(getByText('View Test Ballot Decks'))
  fireEvent.click(getByText('All Precincts'))
  fireEvent.click(getByText('Back to Admin Dashboard'))
})
