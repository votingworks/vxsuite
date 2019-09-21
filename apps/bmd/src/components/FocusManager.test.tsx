import React from 'react'
import { render } from '../../test/testUtils'

import FocusManager from './FocusManager'

it('renders FocusManager', async () => {
  const { container } = render(<FocusManager>foo</FocusManager>)
  expect(container.firstChild).toMatchSnapshot()
})
