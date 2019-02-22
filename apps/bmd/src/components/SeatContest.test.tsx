import { axe } from 'jest-axe'
import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import election from '../../public/data/election.json'

import SeatContest from './SeatContest'

it(`allows any candidate to be selected when no candidate is selected`, () => {
  const updateVote = jest.fn()
  const { container, getByText, debug } = render(
    <SeatContest
      contest={election.contests[0]}
      vote=""
      updateVote={updateVote}
    />
  )

  fireEvent.click(getByText('Minnie Mouse').closest('label') as HTMLElement)
  expect(updateVote).toHaveBeenCalledTimes(1)

  fireEvent.click(getByText('Mickey Mouse').closest('label') as HTMLElement)
  expect(updateVote).toHaveBeenCalledTimes(2)

  fireEvent.click(getByText('Donald Duck').closest('label') as HTMLElement)
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
      contest={election.contests[0]}
      vote={'Minnie Mouse'}
      updateVote={updateVote}
    />
  )
  expect(container).toMatchSnapshot()

  const minnieMouseInput = (getByText('Minnie Mouse').closest(
    'label'
  ) as HTMLElement).querySelector('input') as HTMLInputElement
  expect(minnieMouseInput.disabled).toBeFalsy()
  expect(minnieMouseInput.checked).toBeTruthy()

  const mickeyInput = (getByText('Mickey Mouse').closest(
    'label'
  ) as HTMLElement).querySelector('input') as HTMLInputElement
  expect(mickeyInput.disabled).toBeTruthy()
  expect(mickeyInput.checked).toBeFalsy()

  const donaldDuckInput = (getByText('Donald Duck').closest(
    'label'
  ) as HTMLElement).querySelector('input') as HTMLInputElement
  expect(donaldDuckInput.disabled).toBeTruthy()
  expect(donaldDuckInput.checked).toBeFalsy()

  fireEvent.click(getByText('Mickey Mouse').closest('label') as HTMLElement)
  expect(updateVote).not.toHaveBeenCalled()

  fireEvent.click(getByText('Donald Duck').closest('label') as HTMLElement)
  expect(updateVote).not.toHaveBeenCalled()

  fireEvent.click(getByText('Minnie Mouse').closest('label') as HTMLElement)
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
//       vote={'Minnie Mouse'}
//       updateVote={updateVote}
//     />
//   )
//   expect(await axe(container.innerHTML)).toHaveNoViolations()
// })
