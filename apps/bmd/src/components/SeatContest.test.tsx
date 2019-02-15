import { axe } from 'jest-axe'
import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import election from '../../public/data/election.json'

import SeatContest from './SeatContest'

it(`allows any candidate to be selected when no candidate is selected`, () => {
  const updateVote = jest.fn()
  const { container, getByText } = render(
    <SeatContest
      contest={election.contests[0]}
      vote=""
      updateVote={updateVote}
    />
  )

  fireEvent.click(getByText('Minnie Mouse'))
  expect(updateVote).toHaveBeenCalledTimes(1)

  fireEvent.click(getByText('Mickey Mouse'))
  expect(updateVote).toHaveBeenCalledTimes(2)

  fireEvent.click(getByText('Donald Duck'))
  expect(updateVote).toHaveBeenCalledTimes(3)

  expect(container).toMatchSnapshot()

  // TODO: Why doesn't axe work when used in two tests in the same file?
  // expect(await axe(container.innerHTML)).toHaveNoViolations()
  // See tests below… which are used instead of the above line
})

it(`doesn't allow other candidates to be selected when one candidate is selected`, () => {
  const updateVote = jest.fn()
  const { container, getByText, getByLabelText } = render(
    <SeatContest
      contest={election.contests[0]}
      vote={'minnieMouse'}
      updateVote={updateVote}
    />
  )
  expect(container).toMatchSnapshot()

  const minnieMouseInput = getByLabelText('Minnie Mouse') as HTMLInputElement
  expect(minnieMouseInput.disabled).toBeFalsy()
  expect(minnieMouseInput.checked).toBeTruthy()

  const mickeyInput = getByLabelText('Mickey Mouse') as HTMLInputElement
  expect(mickeyInput.disabled).toBeTruthy()
  expect(mickeyInput.checked).toBeFalsy()

  const donaldDuckInput = getByLabelText('Donald Duck') as HTMLInputElement
  expect(donaldDuckInput.disabled).toBeTruthy()
  expect(donaldDuckInput.checked).toBeFalsy()

  fireEvent.click(getByText('Mickey Mouse'))
  expect(updateVote).not.toHaveBeenCalled()

  fireEvent.click(getByText('Donald Duck'))
  expect(updateVote).not.toHaveBeenCalled()

  fireEvent.click(getByText('Minnie Mouse'))
  expect(updateVote).toHaveBeenCalled()

  // TODO: Why doesn't axe work when used in two tests in the same file?
  // expect(await axe(container.innerHTML)).toHaveNoViolations()
  // See tests below… which are used instead of the above line
})

// TODO: Update this test to pass.
// - Failed when ReactModal was added with Modal component.
// - Error: "NotFoundError: The object can not be found here."
// - It is unclear what is causing this error.
// it(`accessible when no candidate is selected`, async () => {
//   const updateVote = jest.fn()
//   const { container } = render(
//     <SeatContest
//       contest={election.contests[0]}
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
//       contest={election.contests[0]}
//       vote={'minnieMouse'}
//       updateVote={updateVote}
//     />
//   )
//   expect(await axe(container.innerHTML)).toHaveNoViolations()
// })
