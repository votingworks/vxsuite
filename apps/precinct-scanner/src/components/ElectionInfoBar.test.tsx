import React from 'react'
import { render } from '@testing-library/react'
import ElectionInfoBar from './ElectionInfoBar'

test('as paragraph tag', async () => {
  const component = render(<ElectionInfoBar />)
  expect(component).toMatchSnapshot()
})
