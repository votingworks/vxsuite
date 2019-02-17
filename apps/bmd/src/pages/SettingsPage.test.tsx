import { axe } from 'jest-axe'
import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import SettingsPage from './SettingsPage'

it(`renders SettingsPage`, () => {
  const { container } = render(<Route path="/" component={SettingsPage} />, {
    route: '/',
  })
  expect(container.firstChild).toMatchSnapshot()
})

// TODO: Update this test to pass.
// - Failed when ReactModal was added with Modal component.
// - Error: "NotFoundError: The object can not be found here."
// - It is unclear what is causing this error.
// it(`renders SettingsPage`, async () => {
//   const { container } = render(<Route path="/" component={SettingsPage} />, {
//     route: '/',
//   })
//   expect(await axe(container.innerHTML)).toHaveNoViolations()
// })
