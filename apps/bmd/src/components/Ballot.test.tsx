// Accessibility is not tested because ballot alone does not render html.
// Each route component is tested elsewhere.

import React from 'react'
import { fireEvent } from 'react-testing-library'

import { render } from '../../test/testUtils'

import electionSample from '../data/electionSample.json'

import Ballot from './Ballot'

it(`can navigate all ballot pages`, () => {
  window.print = jest.fn()
  const { container, getByText, getByTestId, queryByText, history } = render(
    <Ballot />,
    {
      ballotStyleId: '',
      precinctId: '',
    }
  )
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.change(getByTestId('activation-code'), {
    target: {
      value: 'VX.23.12',
    },
  })
  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))
  fireEvent.click(getByText('Get Started'))
  fireEvent.click(getByText('Start Voting'))
  fireEvent.click(getByText('Help'))
  getByText('Help content will be available here.')
  fireEvent.click(getByText('Back'))
  fireEvent.click(getByText('Settings'))
  getByText('Adjust the following settings to meet your needs.')
  fireEvent.click(getByText('Back'))

  // Click through all contests
  electionSample.contests.forEach(() => {
    fireEvent.click(getByText('Next'))
  })
  // Go to Pre Review Screen, through all contest pages.
  while (!queryByText('Review Your Selections')) {
    fireEvent.click(getByText('Next'))
  }

  // Review Screen
  fireEvent.click(getByText('Review Selections'))
  getByText('Review Your Ballot Selections')

  // Print Screen
  fireEvent.click(getByText('Next'))
  getByText('Print your official ballot')

  // Manually load cast page (as full BallotContext not provided to integration test)
  history.push('/cast')

  // Verify and Cast Screen
  getByText('Cast your printed ballot')
  fireEvent.click(getByText('Okay, I will review and cast my printed ballot.'))

  // Back to beginning
  getByText('Scan Your Activation Code')
})

it(`redirects contests index to first contest`, () => {
  const { getByText } = render(<Ballot />, {
    route: '/contests',
  })
  getByText(electionSample.contests[0].title)
})

it(`skips activation page if disabled`, () => {
  const { getByText } = render(<Ballot />, {
    election: {
      ...electionSample,
      ...{
        bmdConfig: {
          requireActivation: false,
        },
      },
    },
    route: '/',
  })
  getByText('Get Started')
})
