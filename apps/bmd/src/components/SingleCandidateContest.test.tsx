import { axe } from 'jest-axe'
import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import election from '../../public/data/election.json'

import SingleCandidateContest from './SingleCandidateContest'

const presidentName = 'Minnie Mouse'
const presidentId = 'minnieMouse'
const updateVote = jest.fn(value => value === presidentId)

it(`renders SingleCandidateContest with no selection`, async () => {
  const { container, getByText } = render(
    <SingleCandidateContest
      contest={election.contests[0]}
      vote=""
      updateVote={updateVote}
    />
  )
  fireEvent.click(getByText(presidentName))
  expect(updateVote).toHaveBeenCalled()
  expect(container).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})

it(`renders SingleCandidateContest with ${presidentName} selected`, async () => {
  const { container, getByText } = render(
    <SingleCandidateContest
      contest={election.contests[0]}
      vote={presidentId}
      updateVote={updateVote}
    />
  )
  fireEvent.click(getByText(presidentName))
  expect(updateVote).toHaveBeenCalled()
  expect(container).toMatchSnapshot()
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})
