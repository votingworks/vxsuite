import React from 'react'
import { render, fireEvent } from '@testing-library/react'

import { NumberPad } from './NumberPad'

test('Click all pad buttons', () => {
  const onPress = jest.fn()
  const { container, getByText } = render(<NumberPad onButtonPress={onPress} />)
  const button0 = getByText('0')
  fireEvent.click(button0)
  const button1 = getByText('1')
  fireEvent.click(button1)
  const button2 = getByText('2')
  fireEvent.click(button2)
  const button3 = getByText('3')
  fireEvent.click(button3)
  const button4 = getByText('4')
  fireEvent.click(button4)
  const button5 = getByText('5')
  fireEvent.click(button5)
  const button6 = getByText('6')
  fireEvent.click(button6)
  const button7 = getByText('7')
  fireEvent.click(button7)
  const button8 = getByText('8')
  fireEvent.click(button8)
  const button9 = getByText('9')
  fireEvent.click(button9)
  expect(onPress).toHaveBeenCalledTimes(10)

  expect(container.firstChild).toMatchSnapshot()
})
