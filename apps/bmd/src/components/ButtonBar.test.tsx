import React from 'react'
import { render } from 'react-testing-library'

import ButtonBar from './ButtonBar'

it(`renders ButtonBar`, () => {
  const { container } = render(<ButtonBar>foo</ButtonBar>)
  expect(container.firstChild).toMatchSnapshot()
})
