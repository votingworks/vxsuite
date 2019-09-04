import React from 'react'
import { Route } from 'react-router-dom'

import { CandidateContest } from '../config/types'

import { render } from '../../test/testUtils'

import electionSample from '../data/electionSample.json'
import electionSampleWithSeal from '../data/electionSampleWithSeal.json'
import electionSampleNoSeal from '../data/electionSampleNoSeal.json'

import PrintPage from './PrintPage'

import { randomBase64 } from '../utils/random'

// mock the random value so the snapshots match
jest.mock('../utils/random')
const randomBase64Mock = randomBase64 as jest.Mock
randomBase64Mock.mockReturnValue('CHhgYxfN5GeqnK8KaVOt1w')

const contest0 = electionSample.contests[0] as CandidateContest
const contest1 = electionSample.contests[1] as CandidateContest
const contest0candidate0 = contest0.candidates[0]
const contest1candidate0 = contest1.candidates[0]

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
    votes: {
      president: [contest0candidate0],
      'question-a': 'no',
      'question-b': 'yes',
      senator: [contest1candidate0],
    },
  })
  expect(container.firstChild).toMatchSnapshot()
})

it('renders PrintPage without votes and inline seal', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    election: electionSampleWithSeal,
    precinctId: '21',
    route: '/print',
  })
  expect(container.firstChild).toMatchSnapshot()
})

it('renders PrintPage without votes and no seal', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    election: electionSampleNoSeal,
    precinctId: '21',
    route: '/print',
  })
  expect(container.firstChild).toMatchSnapshot()
})
