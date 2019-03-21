import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import electionDefaults from '../data/electionDefaults.json'
import electionSample from '../data/electionSample.json'

const firstContestId = electionSample.contests[0].id

import ContestPage from './ContestPage'

it(`renders ContestPage`, () => {
  const { container } = render(
    <Route path="/contests/:id" component={ContestPage} />,
    {
      route: `/contests/${firstContestId}`,
    }
  )
  expect(container).toMatchSnapshot()
})

it(`renders error if no id match`, () => {
  const { container } = render(
    <Route path="/contests/:id" component={ContestPage} />,
    {
      route: '/contests/foobar',
    }
  )
  expect(container).toMatchSnapshot()
})

it(`displays accessible error if no id match`, () => {
  const { container } = render(
    <Route path="/contests/:id" component={ContestPage} />,
    {
      route: '/contests/foobar',
    }
  )
  expect(container).toMatchSnapshot()
})

it(`doesn't display help and settings pages if disabled`, () => {
  const { container, queryByText } = render(
    <Route path="/contests/:id" component={ContestPage} />,
    {
      election: {
        ...electionDefaults,
        ...electionSample,
        ...{
          bmdConfig: {
            showHelpPage: false,
            showSettingsPage: false,
          },
        },
      },
      route: `/contests/${firstContestId}`,
    }
  )
  expect(queryByText('Help')).toBeFalsy()
  expect(queryByText('Settings')).toBeFalsy()
  expect(container).toMatchSnapshot()
})
