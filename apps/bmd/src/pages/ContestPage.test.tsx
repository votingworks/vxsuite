import lodashMerge from 'lodash.merge'
import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import electionDefaults from '../data/electionDefaults.json'
import electionSample from '../data/electionSample.json'

import ContestPage from './ContestPage'

it(`renders ContestPage`, () => {
  const { container } = render(
    <Route path="/contests/:id" component={ContestPage} />,
    {
      route: '/contests/president',
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
      election: lodashMerge(electionDefaults, electionSample, {
        bmdConfig: {
          showHelpPage: false,
          showSettingsPage: false,
        },
      }),
      route: '/contests/president',
    }
  )
  expect(queryByText('Help')).toBeFalsy()
  expect(queryByText('Settings')).toBeFalsy()
  expect(container).toMatchSnapshot()
})

// TODO: Update this test to pass.
// - Failed when ReactModal was added with Modal component.
// - Error: "NotFoundError: The object can not be found here."
// - It is unclear what is causing this error.
// it(`displays accessible ContestPage`, async () => {
//   const { container } = render(
//     <Route path="/contests/:id" component={ContestPage} />,
//     {
//       route: '/contests/president',
//     }
//   )
//   expect(await axe(container.innerHTML)).toHaveNoViolations()
// })
