import { axe } from 'jest-axe'
import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import ContestPage from './ContestPage'

it(`renders ContestPage`, async () => {
  const { container } = render(
    <Route path="/contests/:id" component={ContestPage} />,
    {
      route: '/contests/president',
    }
  )
  expect(container.firstChild).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})

it(`renders error if no id match`, async () => {
  const { container } = render(
    <Route path="/contests/:id" component={ContestPage} />,
    {
      route: '/contests/foobar',
    }
  )
  expect(container.firstChild).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})
