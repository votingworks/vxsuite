import { render } from '@testing-library/react'

import { InputGroup } from './InputGroup'
import { Select } from './Select'

test('renders InputGroup', async () => {
  const { container } = render(
    <InputGroup>
      <Select>
        <option value="1">1</option>
      </Select>
      <Select>
        <option value="2">2</option>
      </Select>
      <Select>
        <option value="3">3</option>
      </Select>
    </InputGroup>
  )
  expect(container.firstChild).toMatchSnapshot()
})
