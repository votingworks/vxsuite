import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import electionSample from '../data/electionSample.json'

import ContestPage from './ContestPage'

const firstContestTitle = electionSample.contests[0].title

it('Renders ContestPage', () => {
  const { container, getByText } = render(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      route: '/contests/0',
    }
  )
  getByText(firstContestTitle)
  expect(container).toMatchSnapshot()
})
