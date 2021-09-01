import React from 'react'
import { render } from '@testing-library/react'

import { ButtonBar } from './ButtonBar'

test('renders ButtonBar', () => {
  const { container } = render(<ButtonBar>foo</ButtonBar>)
  expect(container.firstChild).toMatchSnapshot()
})
