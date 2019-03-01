// import { axe } from 'jest-axe'
import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import { CandidateContest as CandidateContestInterface } from '../config/types'

import electionSample from '../data/electionSample.json'

import CandidateContest from './CandidateContest'

const contest = {
  allowWriteIns: true,
  candidates: [
    {
      id: 'solis',
      name: 'Andrea Solis',
      party: 'Federalist',
    },
    {
      id: 'keller',
      name: 'Amos Keller',
      party: "People's",
    },
    {
      id: 'rangel',
      name: 'Davitra Rangel',
      party: 'Liberty',
    },
  ],
  id: 'state-assembly',
  seats: 1,
  section: '54th District',
  title: 'State Assembly',
  type: 'candidate',
} as CandidateContestInterface
const candidate0 = contest.candidates[0]
const candidate1 = contest.candidates[1]
const candidate2 = contest.candidates[2]

it(`allows any candidate to be selected when no candidate is selected`, () => {
  const updateVote = jest.fn()
  const { container, getByText } = render(
    <CandidateContest contest={contest} vote={[]} updateVote={updateVote} />
  )
  expect(container).toMatchSnapshot()

  fireEvent.click(getByText(candidate0.name).closest('label')!)
  expect(updateVote).toHaveBeenCalledTimes(1)

  fireEvent.click(getByText(candidate1.name).closest('label')!)
  expect(updateVote).toHaveBeenCalledTimes(2)

  fireEvent.click(getByText(candidate2.name).closest('label')!)
  expect(updateVote).toHaveBeenCalledTimes(3)
})

it(`doesn't allow other candidates to be selected when 1 of 1 candidates have been selected`, () => {
  const updateVote = jest.fn()
  const { container, getByText, queryByText } = render(
    <CandidateContest
      contest={contest}
      vote={[candidate0]}
      updateVote={updateVote}
    />
  )
  expect(container).toMatchSnapshot()

  const candidate0Input = getByText(candidate0.name)
    .closest('label')!
    .querySelector('input')!
  expect(candidate0Input.disabled).toBeFalsy()
  expect(candidate0Input.checked).toBeTruthy()

  const candidate1Input = getByText(candidate1.name)
    .closest('label')!
    .querySelector('input')!
  expect(candidate1Input.disabled).toBeTruthy()
  expect(candidate1Input.checked).toBeFalsy()

  const candidate2Input = getByText(candidate2.name)
    .closest('label')!
    .querySelector('input')!
  expect(candidate2Input.disabled).toBeTruthy()
  expect(candidate2Input.checked).toBeFalsy()

  expect(queryByText('add write-in candidate')).toBeFalsy()

  fireEvent.click(getByText(candidate1.name).closest('label')!)
  expect(updateVote).not.toHaveBeenCalled()

  fireEvent.click(getByText(candidate2.name).closest('label')!)
  expect(updateVote).not.toHaveBeenCalled()

  fireEvent.click(getByText(candidate0.name).closest('label')!)
  expect(updateVote).toHaveBeenCalled()
})

it(`allows another candidate to be selected when 1 of 2 have been selected`, () => {
  const updateVote = jest.fn()
  const { container, getByText, queryByText } = render(
    <CandidateContest
      contest={{ ...contest, seats: 2 }}
      vote={[candidate0]}
      updateVote={updateVote}
    />
  )
  expect(container).toMatchSnapshot()

  const candidate0Input = getByText(candidate0.name)
    .closest('label')!
    .querySelector('input')!
  expect(candidate0Input.disabled).toBeFalsy()
  expect(candidate0Input.checked).toBeTruthy()

  const candidate1Input = getByText(candidate1.name)
    .closest('label')!
    .querySelector('input')!
  expect(candidate1Input.disabled).toBeFalsy()
  expect(candidate1Input.checked).toBeFalsy()

  const candidate2Input = getByText(candidate2.name)
    .closest('label')!
    .querySelector('input')!
  expect(candidate2Input.disabled).toBeFalsy()
  expect(candidate2Input.checked).toBeFalsy()

  expect(queryByText('add write-in candidate')).toBeTruthy()

  fireEvent.click(getByText(candidate1.name).closest('label')!)
  expect(updateVote).toHaveBeenCalled()

  fireEvent.click(getByText(candidate2.name).closest('label')!)
  expect(updateVote).toHaveBeenCalled()

  fireEvent.click(getByText(candidate0.name).closest('label')!)
  expect(updateVote).toHaveBeenCalled()
})

const contestWithWriteIns = electionSample.contests.find(
  c => !!c.allowWriteIns && c.type === 'candidate'
) as CandidateContestInterface
it(`displays warning if write-in candidate name is too long`, () => {
  const updateVote = jest.fn()
  const { container, getByText } = render(
    <CandidateContest
      contest={contestWithWriteIns}
      vote={[]}
      updateVote={updateVote}
    />
  )
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  expect(getByText('Write-In Candidate')).toBeTruthy()
  Array.from('JACOB JOHANSON JINGLEHEIMMER SCHMIDTT').forEach(i => {
    const key = i === ' ' ? 'space' : i
    fireEvent.click(getByText(key).closest('button')!)
  })
  expect(
    getByText('You have entered 37 of maximum 40 characters.')
  ).toBeTruthy()
  expect(container).toMatchSnapshot()
})
