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
  fireEvent.click(getByText('Get Started'))
  fireEvent.click(getByText('Next'))
  fireEvent.click(getByText('Help'))
  getByText('Help content will be available here.')
  fireEvent.click(getByText('Back'))
  fireEvent.click(getByText('Settings'))
  getByText('Settings will be available here.')
  fireEvent.click(getByText('Back'))
  fireEvent.click(getByText('Review'))
  fireEvent.click(getByText('Back'))
})

it(`redirects contests index to first contest`, () => {
  const { getByText } = render(<Ballot />, {
    route: '/contests',
  })
  getByText(electionSample.contests[0].title)
})

it(`skips activation page if disabled`, () => {
  const { getByText } = render(<Ballot />, {
    election: lodashMerge(electionSample, {
      bmdConfig: {
        requireActivation: false,
      },
    }),
    route: '/',
  })
  getByText('Get Started')
})
