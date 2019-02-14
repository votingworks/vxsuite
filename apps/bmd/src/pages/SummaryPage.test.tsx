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

fit(`renders SummaryPage with votes and request New Ballot`, () => {
  const resetBallot = jest.fn()
  const { container, getByText, debug } = render(
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
  fireEvent.click(getByText('New Ballot'))
  fireEvent.click(getByText('Start Over'))
  expect(resetBallot).toHaveBeenCalled()
})

it(`renders SummaryPage with votes and cancels request New Ballot`, () => {
  const resetBallot = jest.fn()
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
  fireEvent.click(getByText('Cancel'))
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
