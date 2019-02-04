import { axe } from 'jest-axe'
import React from 'react'
import { render } from 'react-testing-library'

import ButtonBar from './ButtonBar'

it(`renders ButtonBar`, async () => {
  const { container } = render(<ButtonBar>foo</ButtonBar>)
  expect(container.firstChild).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})
