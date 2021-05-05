import React from 'react'
import { render } from '@testing-library/react'
import ElectionInfoBar from './ElectionInfoBar'

test('Renders ElectionInfoBar', async () => {
  const { container } = render(<ElectionInfoBar />)
  expect(container).toMatchSnapshot()
})
