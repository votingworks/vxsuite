import { axe } from 'jest-axe'
import React from 'react'
import { render } from 'react-testing-library'

import Button from './Button'

it(`renders Button`, async () => {
  const { container } = render(<Button>foo</Button>)
  expect(await axe(container.innerHTML)).toHaveNoViolations()
  expect(container.firstChild).toMatchSnapshot()
})
