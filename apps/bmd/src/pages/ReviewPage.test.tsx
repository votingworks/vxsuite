import { axe } from 'jest-axe'
import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import { fireEvent } from 'react-testing-library'
import SummaryPage from './ReviewPage'

it(`renders SummaryPage and request New Ballot`, () => {
  const resetBallot = jest.fn()
  const { container, getByText } = render(
    <Route path="/review" component={SummaryPage} />,
    {
      resetBallot,
      route: '/review',
    }
  )
  expect(container.firstChild).toMatchSnapshot()
  const newBallotButton = getByText('New Ballot')
  expect(resetBallot).not.toHaveBeenCalled()
  fireEvent.click(newBallotButton)
  expect(resetBallot).toHaveBeenCalled()
})

fit(`renders SummaryPage with votes and request New Ballot`, () => {
  const resetBallot = jest.fn()
  const { container, getByText, debug } = render(
    <Route path="/review" component={SummaryPage} />,
    {
      resetBallot,
      route: '/review',
      votes: {
        president: 'minnieMouse',
        senator: 'johnSmith',
      },
    }
  )
  expect(container.firstChild).toMatchSnapshot()
  fireEvent.click(getByText('New Ballot'))
  fireEvent.click(getByText('Start Over'))
  expect(resetBallot).toHaveBeenCalled()
})

it(`renders SummaryPage with votes and cancels request New Ballot`, () => {
  const resetBallot = jest.fn()
  const { container, getByText } = render(
    <Route path="/review" component={SummaryPage} />,
    {
      resetBallot,
      route: '/review',
      votes: {
        president: 'minnieMouse',
        senator: 'johnSmith',
      },
    }
  )
  expect(container.firstChild).toMatchSnapshot()
  const newBallotButton = getByText('New Ballot')
  expect(resetBallot).not.toHaveBeenCalled()
  fireEvent.click(newBallotButton)
  fireEvent.click(getByText('Cancel'))
  expect(resetBallot).not.toHaveBeenCalled()
})

it(`empty SummaryPage is accessible`, async () => {
  const resetBallot = jest.fn()
  const { container } = render(
    <Route path="/review" component={SummaryPage} />,
    {
      resetBallot,
      route: '/review',
    }
  )
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})

it(`SummaryPage with votes is accessible`, async () => {
  const resetBallot = jest.fn()
  const { container } = render(
    <Route path="/review" component={SummaryPage} />,
    {
      resetBallot,
      route: '/review',
      votes: {
        president: 'minnieMouse',
        senator: 'johnSmith',
      },
    }
  )
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})
