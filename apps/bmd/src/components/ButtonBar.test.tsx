import React from 'react'
import { render } from '@testing-library/react'

import ButtonBar from './ButtonBar'

it('renders ButtonBar', () => {
  const { container } = render(<ButtonBar>foo</ButtonBar>)
  expect(container.firstChild).toMatchSnapshot()
})

it('renders ButtonBar with natural order and primary button separated', () => {
  const { container } = render(
    <ButtonBar separatePrimaryButton naturalOrder>
      <div>one</div>
      <div>two</div>
      <div>three</div>
    </ButtonBar>
  )
  expect(container.firstChild).toMatchSnapshot()
})
