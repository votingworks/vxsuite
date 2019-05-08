import React from 'react'
import { Route } from 'react-router-dom'

import { CandidateContest } from '../config/types'

import { render } from '../../test/testUtils'

import electionSample from '../data/electionSample.json'

const contest0 = electionSample.contests[0] as CandidateContest
const contest1 = electionSample.contests[1] as CandidateContest
const contest0candidate0 = contest0.candidates[0]
const contest1candidate0 = contest1.candidates[0]

import PrintPage from './PrintPage'

it(`renders PrintPage without votes`, () => {
  const { container } = render(<Route path="/review" component={PrintPage} />, {
    route: '/print',
  })
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders PrintPage with votes`, () => {
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
