import React from 'react'
import { fireEvent, render } from '@testing-library/react'

import ChoiceButton from './ChoiceButton'

const onPress = jest.fn()

it('renders ChoiceButton', () => {
  const { container } = render(
    <ChoiceButton isSelected={false} onPress={onPress}>
      foo
    </ChoiceButton>
  )
  expect(container.firstChild).toMatchSnapshot()
})

it('works properly with clicks and touches', () => {
  const onPress = jest.fn()
  const { getByText } = render(
    <ChoiceButton isSelected={false} onPress={onPress}>
      Test Button
    </ChoiceButton>
  )
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
  fireEvent.click(button)
  expect(onPress).toHaveBeenCalledTimes(5)
})
