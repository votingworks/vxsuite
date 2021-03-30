import { join } from 'path'
import React from 'react'
import { Route } from 'react-router-dom'
import { loadElectionDefinition } from '@votingworks/fixtures'

import { render } from '../../test/testUtils'
import ContestPage from './ContestPage'

const electionSampleDefinition = loadElectionDefinition(
  join(__dirname, '../data/electionSample.json')
)

const firstContestTitle = electionSampleDefinition.election.contests[0].title

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
