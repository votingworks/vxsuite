import { axe } from 'jest-axe'
import React from 'react'
import { render } from 'react-testing-library'

import Text from './Typography'

it(`outputs paragraph tag`, async () => {
  const text = 'paragraph'
  const { container, getByText } = render(<Text>{text}</Text>)
  const element = getByText(text)
  expect(element.tagName).toEqual('P')
  expect(element).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})

it(`outputs "span" tag specified by "as" prop`, async () => {
  const text = 'Text in a span?'
  const { container, getByText } = render(<Text as="span">{text}</Text>)
  const element = getByText(text)
  expect(element.tagName).toEqual('SPAN')
  expect(element).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})

it(`centers centered style`, async () => {
  const { container } = render(<Text center>Centered Text?</Text>)
  expect(container.firstChild).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})

it(`displays muted style`, async () => {
  const { container } = render(<Text muted>Muted Text?</Text>)
  expect(container.firstChild).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})

it(`displays error style`, async () => {
  const { container } = render(<Text error>Error Text?</Text>)
  expect(container.firstChild).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})
