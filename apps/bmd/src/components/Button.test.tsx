import React from 'react'
import { render } from '@testing-library/react'

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
