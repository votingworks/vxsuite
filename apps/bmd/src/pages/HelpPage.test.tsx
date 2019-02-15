import { axe } from 'jest-axe'
import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import HelpPage from './HelpPage'

it(`renders HelpPage`, async () => {
  const { container } = render(<Route path="/" component={HelpPage} />, {
    route: '/',
  })
  expect(container.firstChild).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})
