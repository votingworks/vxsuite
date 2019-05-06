import React from 'react'
import { Route } from 'react-router-dom'

import { CandidateContest } from '../config/types'

import { render } from '../../test/testUtils'

import electionSample from '../data/electionSample.json'

const contest0 = electionSample.contests[0] as CandidateContest
const contest1 = electionSample.contests[1] as CandidateContest
const contest0candidate0 = contest0.candidates[0]
const contest1candidate0 = contest1.candidates[0]

import ReviewPage from './ReviewPage'

const idValueStartsWithNumberRegex = new RegExp('id="[0-9]')

it(`renders ReviewPage without votes`, () => {
  const { container } = render(
    <Route path="/review" component={ReviewPage} />,
    {
      route: '/review',
    }
  )
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders ReviewPage with votes`, () => {
  const { container } = render(
    <Route path="/review" component={ReviewPage} />,
    {
      route: '/review',
      votes: {
        president: [contest0candidate0],
        senator: [contest1candidate0],
      },
    }
  )

  // DOM node IDs cannot start with a number. Browsers will error out.
  expect(idValueStartsWithNumberRegex.test(container.outerHTML)).toBeFalsy()
  expect(container.firstChild).toMatchSnapshot()
})
