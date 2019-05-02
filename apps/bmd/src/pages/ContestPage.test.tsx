import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import electionDefaults from '../data/electionDefaults.json'
import electionSample from '../data/electionSample.json'

const firstContestTitle = electionSample.contests[0].title

import ContestPage from './ContestPage'

it(`renders ContestPage`, () => {
  const { container, getByText } = render(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      route: `/contests/0`,
    }
  )
  getByText(firstContestTitle)
  expect(container).toMatchSnapshot()
})

it(`redirects to top-level page if no contest number match`, () => {
  const resetBallot = jest.fn()
  const homeMock = () => <div>Home Mock</div>
  const { getByText } = render(
    <>
      <Route path="/contests/:contestNumber" component={ContestPage} />
      <Route exact path="/" render={homeMock} />
    </>,
    {
      resetBallot,
      route: '/contests/666666',
    }
  )

  expect(resetBallot).toBeCalled()
  getByText('Home Mock')
})

it(`doesn't display help and settings pages if disabled`, () => {
  const { queryByText } = render(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
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
      route: `/contests/0`,
    }
  )
  expect(queryByText('Help')).toBeFalsy()
  expect(queryByText('Settings')).toBeFalsy()
})
