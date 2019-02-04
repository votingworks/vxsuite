import { axe } from 'jest-axe'
import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import StartPage from './StartPage'

it(`renders StartPage`, async () => {
  const { container } = render(<Route path="/" component={StartPage} />, {
    route: '/',
  })
  expect(container.firstChild).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})
