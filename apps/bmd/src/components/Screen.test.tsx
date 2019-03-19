import { axe } from 'jest-axe'
import React from 'react'
import { render } from '../../test/testUtils'

import Screen from './Screen'

it(`renders Screen`, async () => {
  const { container } = render(<Screen>foo</Screen>)
  expect(await axe(container.innerHTML)).toHaveNoViolations()
  expect(container.firstChild).toMatchSnapshot()
})
