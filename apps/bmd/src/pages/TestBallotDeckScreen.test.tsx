import {
  //electionSample,
  Election,
} from '@votingworks/ballot-encoder'
// TODO: Tally: Use electionSample from ballot-encoder once published.

import React from 'react'
import { fireEvent } from '@testing-library/react'
import electionSample from '../data/electionSample.json'
import { mockOf, render } from '../../test/testUtils'
import { randomBase64 } from '../utils/random'
import TestBallotDeckScreen from './TestBallotDeckScreen'

// mock the random value so the snapshots match
jest.mock('../utils/random')
const randomBase64Mock = mockOf(randomBase64)
randomBase64Mock.mockReturnValue('CHhgYxfN5GeqnK8KaVOt1w')

it('renders test decks appropriately', () => {
  const { getAllByText, getByText } = render(
    <TestBallotDeckScreen
      appName="VxPrint"
      appPrecinctId="23"
      election={electionSample as Election}
      hideTestDeck={jest.fn()}
      isLiveMode={false}
    />
  )

  fireEvent.click(getByText('All Precincts'))

  expect(getAllByText('Unofficial TEST Ballot')).toHaveLength(63)
  expect(getAllByText('For either', { exact: false })).toHaveLength(31)
  expect(getAllByText('FOR Measure 420A', { exact: false })).toHaveLength(31)
  expect(getAllByText('County Commissioners')).toHaveLength(52)
})
