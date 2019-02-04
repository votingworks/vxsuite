import { axe } from 'jest-axe'
import React from 'react'
import { render } from 'react-testing-library'

import Main from './Main'

it(`renders Main`, async () => {
  const { container } = render(<Main>foo</Main>)
  expect(await axe(container.innerHTML)).toHaveNoViolations()
  expect(container.firstChild).toMatchSnapshot()
})
