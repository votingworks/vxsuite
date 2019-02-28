// Accessibility is not tested because ballot alone does not render html.
// Each route component is tested elsewhere.

import lodashMerge from 'lodash.merge'
import React from 'react'
import { fireEvent } from 'react-testing-library'

import { render } from '../../test/testUtils'

import electionSample from '../data/electionSample.json'

import Ballot from './Ballot'

it(`can navigate all ballot pages`, () => {
  const { container, getByText, getByTestId } = render(<Ballot />)
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.change(getByTestId('activation-code'), {
    target: { value: 'MyVoiceIsMyPassword' },
  })
  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))
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
  const { container, getByText } = render(<Ballot />, {
    route: '/contests',
  })
  getByText('President')
  expect(container.firstChild).toMatchSnapshot()
})

it('skips activation if when disabled', () => {
  const { container, getByText } = render(<Ballot />, {
    election: lodashMerge(electionSample, {
      bmdConfig: {
        requireActivation: false,
      },
    }),
    route: '/',
  })
  getByText('Get Started')
  expect(container.firstChild).toMatchSnapshot()
})
