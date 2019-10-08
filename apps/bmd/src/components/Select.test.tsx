import React from 'react'
import { render } from '@testing-library/react'

import Select from './Select'

const options = (
  <React.Fragment>
    <option value="a">a</option>
    <option value="b">b</option>
    <option value="c">c</option>
  </React.Fragment>
)

it('Inline select', async () => {
  const { container } = render(<Select>{options}</Select>)
  expect(container.firstChild).toMatchSnapshot()
})

it('Full-width select', async () => {
  const { container } = render(<Select fullWidth>{options}</Select>)
  expect(container.firstChild).toMatchSnapshot()
})
