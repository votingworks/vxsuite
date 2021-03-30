import { join } from 'path'
import { electionSample, loadElectionDefinition } from '@votingworks/fixtures'
import { getBallotStyle, getContests, vote } from '@votingworks/types'
import React from 'react'
import { Route } from 'react-router-dom'
import { mockOf, render } from '../../test/testUtils'
import { randomBase64 } from '../utils/random'
import PrintPage from './PrintPage'

const electionSampleNoSealDefinition = loadElectionDefinition(
  join(__dirname, '../data/electionSampleNoSeal.json')
)
const electionSampleWithSealDefinition = loadElectionDefinition(
  join(__dirname, '../data/electionSampleWithSeal.json')
)

// mock the random value so the snapshots match
jest.mock('../utils/random')
const randomBase64Mock = mockOf(randomBase64)
randomBase64Mock.mockReturnValue('CHhgYxfN5GeqnK8KaVOt1w')

it('renders PrintPage without votes', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    precinctId: '21',
    route: '/print',
  })
  expect(container.firstChild).toMatchSnapshot()
})

it('renders PrintPage with votes', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    precinctId: '21',
    route: '/print',
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election: electionSample,
          ballotStyleId: '5',
        })!,
        election: electionSample,
      }),
      {
        president: 'barchi-hallaren',
        'question-a': ['no'],
        'question-b': ['yes'],
        'lieutenant-governor': 'norberg',
      }
    ),
  })
  expect(container.childNodes[1]).toMatchSnapshot()
})

it('renders PrintPage without votes and inline seal', () => {
  const electionDefinition = electionSampleWithSealDefinition
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
    precinctId: '21',
    route: '/print',
  })
  expect(container.childNodes[1]).toMatchSnapshot()
})

it('renders PrintPage without votes and no seal', () => {
  const electionDefinition = electionSampleNoSealDefinition
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
    precinctId: '21',
    route: '/print',
  })
  expect(container.childNodes[1]).toMatchSnapshot()
})
