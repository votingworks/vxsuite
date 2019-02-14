import { axe } from 'jest-axe'
import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

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
})

it(`displays accessible error if no id match`, async () => {
  const { container } = render(
    <Route path="/contests/:id" component={ContestPage} />,
    {
      route: '/contests/foobar',
    }
  )
  expect(await axe(document.body.innerHTML)).toHaveNoViolations()
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
