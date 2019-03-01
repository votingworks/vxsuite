// import { axe } from 'jest-axe'
import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import electionSample from '../data/electionSample.json'
const Q1Candidates = electionSample.contests[0]!.candidates
const Q1Candidate1 = Q1Candidates[0]!.name
const Q1Candidate2 = Q1Candidates[1]!.name
const Q1Candidate3 = Q1Candidates[2]!.name

import SeatContest from './SeatContest'

it(`allows any candidate to be selected when no candidate is selected`, () => {
  const updateVote = jest.fn()
  const { container, getByText } = render(
    <SeatContest
      contest={electionSample.contests[0]}
      vote={undefined}
      updateVote={updateVote}
    />
  )

  fireEvent.click(getByText(Q1Candidate1).closest('label')!)
  expect(updateVote).toHaveBeenCalledTimes(1)

  fireEvent.click(getByText(Q1Candidate2).closest('label')!)
  expect(updateVote).toHaveBeenCalledTimes(2)

  fireEvent.click(getByText(Q1Candidate3).closest('label')!)
  expect(updateVote).toHaveBeenCalledTimes(3)

  expect(container).toMatchSnapshot()

  // TODO: Why doesn't axe work when used in two tests in the same file?
  // expect(await axe(container.innerHTML)).toHaveNoViolations()
  // See tests below… which are used instead of the above line
})

it(`doesn't allow other candidates to be selected when one candidate is selected`, () => {
  const updateVote = jest.fn()
  const { container, getByText } = render(
    <SeatContest
      contest={electionSample.contests[0]}
      vote={electionSample.contests[0].candidates[0]}
      updateVote={updateVote}
    />
  )
  expect(container).toMatchSnapshot()

  const Candidate1Input = getByText(Q1Candidate1)
    .closest('label')!
    .querySelector('input')!
  expect(Candidate1Input.disabled).toBeFalsy()
  expect(Candidate1Input.checked).toBeTruthy()

  const Candidate2Input = getByText(Q1Candidate2)
    .closest('label')!
    .querySelector('input')!
  expect(Candidate2Input.disabled).toBeTruthy()
  expect(Candidate2Input.checked).toBeFalsy()

  const Candidate3Input = getByText(Q1Candidate3)
    .closest('label')!
    .querySelector('input')!
  expect(Candidate3Input.disabled).toBeTruthy()
  expect(Candidate3Input.checked).toBeFalsy()

  fireEvent.click(getByText(Q1Candidate2).closest('label')!)
  expect(updateVote).not.toHaveBeenCalled()

  fireEvent.click(getByText(Q1Candidate3).closest('label')!)
  expect(updateVote).not.toHaveBeenCalled()

  fireEvent.click(getByText(Q1Candidate1).closest('label')!)
  expect(updateVote).toHaveBeenCalled()

  // TODO: Why doesn't axe work when used in two tests in the same file?
  // expect(await axe(container.innerHTML)).toHaveNoViolations()
  // See tests below… which are used instead of the above line
})

it(`displays warning if write-in candidate name is too long`, () => {
  const updateVote = jest.fn()
  const { getByText } = render(
    <SeatContest
      contest={electionSample.contests[0]}
      vote={undefined}
      updateVote={updateVote}
    />
  )
  fireEvent.click(getByText('add a write-in candidate').closest('label')!)
  expect(getByText('Write-In Candidate')).toBeTruthy()
  Array.from('JACOB JOHANSON JINGLEHEIMMER SCHMIDTT').forEach(i => {
    const key = i === ' ' ? 'space' : i
    fireEvent.click(getByText(key).closest('button')!)
  })
  expect(
    getByText('You have entered 37 of maximum 40 characters.')
  ).toBeTruthy()
})

// TODO: Update this test to pass.
// - Failed when ReactModal was added with Modal component.
// - Error: "NotFoundError: The object can not be found here."
// - It is unclear what is causing this error.
// it(`accessible when no candidate is selected`, async () => {
//   const updateVote = jest.fn()
//   const { container } = render(
//     <SeatContest
//       contest={electionSample.contests[0]}
//       vote=""
//       updateVote={updateVote}
//     />
//   )
//   expect(await axe(container.innerHTML)).toHaveNoViolations()
// })

// TODO: Update this test to pass.
// - Failed when ReactModal was added with Modal component.
// - Error: "NotFoundError: The object can not be found here."
// - It is unclear what is causing this error.
// it(`accessible when one candidate is selected`, async () => {
//   const updateVote = jest.fn()
//   const { container } = render(
//     <SeatContest
//       contest={electionSample.contests[0]}
//       vote={'Minnie Mouse'}
//       updateVote={updateVote}
//     />
//   )
//   expect(await axe(container.innerHTML)).toHaveNoViolations()
// })
