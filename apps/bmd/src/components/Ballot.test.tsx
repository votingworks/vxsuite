// Accessibility is not tested because ballot alone does not render html.
// Each route component is tested elsewhere.

import React from 'react'
import { fireEvent } from 'react-testing-library'

import { render } from '../../test/testUtils'

import Ballot from './Ballot'

it(`can navigate all ballot pages`, () => {
  const { container, getByText } = render(<Ballot />)
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('Get Started'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('Next'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('View Summary'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('New Ballot'))
  expect(container.firstChild).toMatchSnapshot()
})

it('redirects contests index to first contest', () => {
  const { container } = render(<Ballot />, {
    route: '/contests',
  })
  expect(container.firstChild).toMatchSnapshot()
})
