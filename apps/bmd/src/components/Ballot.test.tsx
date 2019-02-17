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

  fireEvent.click(getByText('Help'))
  getByText('Help content will be available here.')
  expect(container.firstChild).toMatchSnapshot()
  fireEvent.click(getByText('Back'))

  fireEvent.click(getByText('Settings'))
  getByText('Settings will be available here.')
  expect(container.firstChild).toMatchSnapshot()
  fireEvent.click(getByText('Back'))

  fireEvent.click(getByText('Review'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('Back'))
  expect(container.firstChild).toMatchSnapshot()
})

it('redirects contests index to first contest', () => {
  const { container } = render(<Ballot />, {
    route: '/contests',
  })
  expect(container.firstChild).toMatchSnapshot()
})
