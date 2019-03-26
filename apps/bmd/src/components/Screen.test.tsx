import React from 'react'
import { render } from '../../test/testUtils'

import Screen from './Screen'

it(`renders Screen`, async () => {
  const { container } = render(<Screen>foo</Screen>)
  expect(container.firstChild).toMatchSnapshot()
})
