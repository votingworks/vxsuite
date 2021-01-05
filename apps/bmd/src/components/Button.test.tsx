import React from 'react'
import { fireEvent, render } from '@testing-library/react'

import Button, { DecoyButton } from './Button'

const createTouchStartEventProperties = (x: number, y: number) => {
  return { touches: [{ clientX: x, clientY: y }] }
}

const createTouchEndEventProperties = (x: number, y: number) => {
  return { changedTouches: [{ clientX: x, clientY: y }] }
}

it('renders Button', () => {
  const { container } = render(<Button onPress={jest.fn()}>foo</Button>)
  expect(container.firstChild).toMatchSnapshot()
})

it('renders primary Button', () => {
  const { container } = render(
    <Button onPress={jest.fn()} primary>
      Primary
    </Button>
  )
  expect(container.firstChild).toMatchSnapshot()
})

it('renders danger Button', () => {
  const { container } = render(
    <Button onPress={jest.fn()} danger>
      Danger!
    </Button>
  )
  expect(container.firstChild).toMatchSnapshot()
})

it('renders big Button', () => {
  const { container } = render(
    <Button onPress={jest.fn()} big>
      I’m a big button!
    </Button>
  )
  expect(container.firstChild).toMatchSnapshot()
})

it('renders small Button', () => {
  const { container } = render(
    <Button onPress={jest.fn()} small>
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

  // TouchEnd close to TouchStart calls onPress.
  fireEvent.touchStart(button, createTouchStartEventProperties(100, 100))
  fireEvent.touchEnd(button, createTouchEndEventProperties(110, 95))
  expect(onPress).toHaveBeenCalledTimes(2)

  // Using preventDefault() with touch prevents the click, so no need to test click de-duping.

  // TouchStart w/o TouchEnd does not call onPress.
  fireEvent.touchStart(button, createTouchStartEventProperties(100, 100))
  expect(onPress).toHaveBeenCalledTimes(2)

  // TouchEnd too far from TouchStart does not call onPress.
  fireEvent.touchEnd(button, createTouchEndEventProperties(131, 95))
  expect(onPress).toHaveBeenCalledTimes(2)

  // Keyboard (also Accessible Controller) fire click event which calls onPress.
  fireEvent.click(button)
  expect(onPress).toHaveBeenCalledTimes(3)
})
