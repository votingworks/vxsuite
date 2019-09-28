import React from 'react'
import { Route } from 'react-router-dom'

import {
  vote,
  electionSample,
  getContests,
  getBallotStyle,
} from 'ballot-encoder'

import { render, mockOf } from '../../test/testUtils'

import electionSampleWithSeal from '../data/electionSampleWithSeal.json'
import electionSampleNoSeal from '../data/electionSampleNoSeal.json'

import PrintPage from './PrintPage'

import { randomBase64 } from '../utils/random'

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
        'question-a': 'no',
        'question-b': 'yes',
        'lieutenant-governor': 'norberg',
      }
    ),
  })
  expect(container.childNodes[1]).toMatchSnapshot()
})

it('renders PrintPage without votes and inline seal', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    election: electionSampleWithSeal,
    precinctId: '21',
    route: '/print',
  })
  expect(container.childNodes[1]).toMatchSnapshot()
})

it('renders PrintPage without votes and no seal', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    election: electionSampleNoSeal,
    precinctId: '21',
    route: '/print',
  })
  expect(container.childNodes[1]).toMatchSnapshot()
})
