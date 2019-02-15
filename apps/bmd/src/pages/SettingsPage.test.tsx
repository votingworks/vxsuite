import { axe } from 'jest-axe'
import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import SettingsPage from './SettingsPage'

it(`renders SettingsPage`, async () => {
  const { container } = render(<Route path="/" component={SettingsPage} />, {
    route: '/',
  })
  expect(container.firstChild).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})
