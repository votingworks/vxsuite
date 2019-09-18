import React from 'react'
import { fireEvent, render } from '@testing-library/react'

import Button, { DecoyButton } from './Button'

const onPress = jest.fn()

it('renders Button', () => {
  const { container } = render(<Button onPress={onPress}>foo</Button>)
  expect(container.firstChild).toMatchSnapshot()
})

it('renders primary Button', () => {
  const { container } = render(
    <Button onPress={onPress} primary>
      Primary
    </Button>
  )
  expect(container.firstChild).toMatchSnapshot()
})

it('renders danger Button', () => {
  const { container } = render(
    <Button onPress={onPress} danger>
      Danger!
    </Button>
  )
  expect(container.firstChild).toMatchSnapshot()
})

it('renders big Button', () => {
  const { container } = render(
    <Button onPress={onPress} big>
      I’m a big button!
    </Button>
  )
  expect(container.firstChild).toMatchSnapshot()
})

it('renders small Button', () => {
  const { container } = render(
    <Button onPress={onPress} small>
      I’m a small button!
    </Button>
  )
  expect(container.firstChild).toMatchSnapshot()
})

it('renders DecoyButton', () => {
  const { container } = render(<DecoyButton>DecoyButton</DecoyButton>)
  expect(container.firstChild).toMatchSnapshot()
})

it('works properly with clicks and touches', () => {
  const onPress = jest.fn()
  const { getByText } = render(<Button onPress={onPress}>Test Button</Button>)
  const button = getByText('Test Button')

  fireEvent.click(button)
  expect(onPress).toHaveBeenCalledTimes(1)

  fireEvent.pointerDown(button)
  expect(onPress).toHaveBeenCalledTimes(2)

  // this is the behavior when a proper touch becomes a click
  fireEvent.pointerDown(button)
  fireEvent.pointerUp(button)
  fireEvent.click(button)
  expect(onPress).toHaveBeenCalledTimes(3)

  // this is the behavior on a bad touch, followed by a separate click
  // so this ends up calling the event handler twice
  fireEvent.pointerDown(button)
  fireEvent.pointerCancel(button)
  expect(onPress).toHaveBeenCalledTimes(4)
  fireEvent.click(button)
  expect(onPress).toHaveBeenCalledTimes(5)
})
