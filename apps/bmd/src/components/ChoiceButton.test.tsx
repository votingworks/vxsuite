import React from 'react'
import { render } from '@testing-library/react'

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
