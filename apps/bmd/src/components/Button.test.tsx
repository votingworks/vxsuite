import { axe } from 'jest-axe'
import React from 'react'
import { render } from 'react-testing-library'

import Button from './Button'

it(`renders Button`, async () => {
  const { container } = render(<Button>foo</Button>)
  expect(await axe(container.innerHTML)).toHaveNoViolations()
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders primary Button`, async () => {
  const { container } = render(<Button primary>Primary</Button>)
  expect(await axe(container.innerHTML)).toHaveNoViolations()
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders danger Button`, async () => {
  const { container } = render(<Button danger>Danger!</Button>)
  expect(await axe(container.innerHTML)).toHaveNoViolations()
  expect(container.firstChild).toMatchSnapshot()
})
