import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import { CandidateContest as CandidateContestInterface } from '../config/types'

import CandidateContest from './CandidateContest'

const contest = {
  allowWriteIns: false,
  candidates: [0, 1, 2].map(i => ({
    id: `name-${i}`,
    name: `Name ${i}`,
    party: `Party ${i % 2}`,
  })),
  id: 'contest-id',
  seats: 1,
  section: 'City',
  title: 'Mayor',
  type: 'candidate',
} as CandidateContestInterface
const candidate0 = contest.candidates[0]
const candidate1 = contest.candidates[1]
const candidate2 = contest.candidates[2]

describe(`supports single-seat contest`, () => {
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

  it(`doesn't allow other candidates to be selected when a candidate is selected`, () => {
    const updateVote = jest.fn()
    const { container, getByText } = render(
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

    // we no longer disable, so not checking this condition anymore
    // but still checking that it isn't checked when clicking
    // expect(candidate1Input.disabled).toBeTruthy()
    fireEvent.click(getByText(candidate1.name).closest('label')!)
    expect(candidate1Input.checked).toBeFalsy()

    const candidate2Input = getByText(candidate2.name)
      .closest('label')!
      .querySelector('input')!

    // same here, we no longer disable
    // expect(candidate2Input.disabled).toBeTruthy()
    fireEvent.click(getByText(candidate2.name).closest('label')!)
    expect(candidate2Input.checked).toBeFalsy()

    fireEvent.click(getByText(candidate1.name).closest('label')!)
    expect(updateVote).not.toHaveBeenCalled()

    fireEvent.click(getByText(candidate2.name).closest('label')!)
    expect(updateVote).not.toHaveBeenCalled()

    fireEvent.click(getByText(candidate0.name).closest('label')!)
    expect(updateVote).toHaveBeenCalled()
  })
})

describe(`supports multi-seat contests`, () => {
  it(`allows a second candidate to be selected when one is selected`, () => {
    const updateVote = jest.fn()
    const { container, getByText } = render(
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

    fireEvent.click(getByText(candidate1.name).closest('label')!)
    expect(updateVote).toHaveBeenCalled()

    fireEvent.click(getByText(candidate2.name).closest('label')!)
    expect(updateVote).toHaveBeenCalled()

    fireEvent.click(getByText(candidate0.name).closest('label')!)
    expect(updateVote).toHaveBeenCalled()
  })
})

describe(`supports write-in candidates`, () => {
  it(`displays warning if write-in candidate name is too long`, () => {
    const updateVote = jest.fn()
    const { container, getByText, queryByText } = render(
      <CandidateContest
        contest={{ ...contest, allowWriteIns: true }}
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
    fireEvent.click(getByText('Cancel'))
    expect(queryByText('Write-In Candidate')).toBeFalsy()
  })
})
