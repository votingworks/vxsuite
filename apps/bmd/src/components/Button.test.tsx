import React from 'react'
import { render } from 'react-testing-library'

import Button, { DecoyButton } from './Button'

it(`renders Button`, () => {
  const { container } = render(<Button>foo</Button>)
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders primary Button`, () => {
  const { container } = render(<Button primary>Primary</Button>)
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders danger Button`, () => {
  const { container } = render(<Button danger>Danger!</Button>)
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders big Button`, () => {
  const { container } = render(<Button big>I’m a big button!</Button>)
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders small Button`, () => {
  const { container } = render(<Button small>I’m a small button!</Button>)
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders DecoyButton`, () => {
  const { container } = render(<DecoyButton>DecoyButton</DecoyButton>)
  expect(container.firstChild).toMatchSnapshot()
})
