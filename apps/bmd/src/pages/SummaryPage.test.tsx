import { axe } from 'jest-axe'
import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import { fireEvent } from 'react-testing-library'
import SummaryPage from './SummaryPage'

it(`renders SummaryPage and request New Ballot`, () => {
  const resetBallot = jest.fn()
  const { container, getByText } = render(
    <Route path="/summary" component={SummaryPage} />,
    {
      resetBallot,
      route: '/summary',
    }
  )
  expect(container.firstChild).toMatchSnapshot()
  const newBallotButton = getByText('New Ballot')
  expect(resetBallot).not.toHaveBeenCalled()
  fireEvent.click(newBallotButton)
  expect(resetBallot).toHaveBeenCalled()
})

it(`renders SummaryPage with votes and request New Ballot`, () => {
  const resetBallot = jest.fn()
  window.confirm = jest.fn(() => true) // approve
  const { container, getByText } = render(
    <Route path="/summary" component={SummaryPage} />,
    {
      resetBallot,
      route: '/summary',
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
  expect(window.confirm).toBeCalled()
  expect(resetBallot).toHaveBeenCalled()
})

it(`renders SummaryPage with votes and cancels request New Ballot`, () => {
  const resetBallot = jest.fn()
  window.confirm = jest.fn(() => false) // cancel
  const { container, getByText } = render(
    <Route path="/summary" component={SummaryPage} />,
    {
      resetBallot,
      route: '/summary',
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
  expect(window.confirm).toBeCalled()
  expect(resetBallot).not.toHaveBeenCalled()
})

it(`empty SummaryPage is accessible`, async () => {
  const resetBallot = jest.fn()
  const { container } = render(
    <Route path="/summary" component={SummaryPage} />,
    {
      resetBallot,
      route: '/summary',
    }
  )
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})

it(`SummaryPage with votes is accessible`, async () => {
  const resetBallot = jest.fn()
  const { container } = render(
    <Route path="/summary" component={SummaryPage} />,
    {
      resetBallot,
      route: '/summary',
      votes: {
        president: 'minnieMouse',
        senator: 'johnSmith',
      },
    }
  )
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})
