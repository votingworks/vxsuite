import React from 'react'
import { render } from 'react-testing-library'

import NoPrint from './NoPrint'

it(`renders NoPrint`, async () => {
  const { container } = render(<NoPrint>foo</NoPrint>)
  expect(container.firstChild).toMatchSnapshot()
})
