import React from 'react'
import { fireEvent, render } from '@testing-library/react'

import Button, { DecoyButton } from './Button'

const createTouchStartEventProperties = (x: number, y: number) => {
  return { touches: [{ clientX: x, clientY: y }] }
}

const createTouchEndEventProperties = (x: number, y: number) => {
  return { changedTouches: [{ clientX: x, clientY: y }] }
}

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

  // touchStart and touchEnd are close together
  fireEvent.touchStart(button, createTouchStartEventProperties(100, 100))
  fireEvent.touchEnd(button, createTouchEndEventProperties(110, 95))
  expect(onPress).toHaveBeenCalledTimes(2)

  // we now preventDefault() inside the events
  // so no need to test the click de-duping

  // only touch start is not enough
  fireEvent.touchStart(button, createTouchStartEventProperties(100, 100))
  expect(onPress).toHaveBeenCalledTimes(2)

  // a touch end too far away won't trigger either
  fireEvent.touchEnd(button, createTouchEndEventProperties(131, 95))
  expect(onPress).toHaveBeenCalledTimes(2)

  // on use of accessible controller / keyboard
  // we get just a click event.
  // this should trigger onPress exactly once.
  fireEvent.click(button)
  expect(onPress).toHaveBeenCalledTimes(3)
})
