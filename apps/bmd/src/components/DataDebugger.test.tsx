import React from 'react'
import { render } from '@testing-library/react'

import DataDebugger from './DataDebugger'

it(`renders DataDebugger`, () => {
  const { container } = render(
    <DataDebugger
      data={{
        foo: 'bar',
      }}
    />
  )
  expect(container.firstChild).toMatchSnapshot()
})

it(`hides DataDebugger`, () => {
  const { container } = render(
    <DataDebugger
      hide
      data={{
        foo: 'bar',
      }}
    />
  )
  expect(container.firstChild).toMatchSnapshot()
})
