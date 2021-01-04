import {
  electionSample,
  getBallotStyle,
  getContests,
  parseElection,
  vote,
} from '@votingworks/ballot-encoder'
import React from 'react'
import { Route } from 'react-router-dom'
import { mockOf, render } from '../../test/testUtils'
import electionSampleNoSeal from '../data/electionSampleNoSeal.json'
import electionSampleWithSeal from '../data/electionSampleWithSeal.json'
import { randomBase64 } from '../utils/random'
import PrintPage from './PrintPage'

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
  const election = parseElection(electionSampleWithSeal)
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    election,
    precinctId: '21',
    route: '/print',
  })
  expect(container.childNodes[1]).toMatchSnapshot()
})

it('renders PrintPage without votes and no seal', () => {
  const election = parseElection(electionSampleNoSeal)
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    election,
    precinctId: '21',
    route: '/print',
  })
  expect(container.childNodes[1]).toMatchSnapshot()
})
