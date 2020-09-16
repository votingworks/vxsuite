import React from 'react'
import { fireEvent, render } from '@testing-library/react'

import { CandidateContest as CandidateContestInterface } from '@votingworks/ballot-encoder'

import CandidateContest from './CandidateContest'

const parties = [0, 1].map((i) => ({
  abbrev: `${i}`,
  id: `party-${i}`,
  name: `Party ${i}`,
}))

const contest: CandidateContestInterface = {
  allowWriteIns: false,
  candidates: [0, 1, 2].map((i) => ({
    id: `name-${i}`,
    name: `Name ${i}`,
    partyId: `party-${i % 2}`,
  })),
  districtId: '7',
  id: 'contest-id',
  seats: 1,
  section: 'City',
  title: 'Mayor',
  type: 'candidate',
}
const candidate0 = contest.candidates[0]
const candidate1 = contest.candidates[1]
const candidate2 = contest.candidates[2]

describe('supports single-seat contest', () => {
  it('allows any candidate to be selected when no candidate is selected', () => {
    const updateVote = jest.fn()
    const { container, getByText } = render(
      <CandidateContest
        contest={contest}
        parties={parties}
        vote={[]}
        updateVote={updateVote}
      />
    )
    expect(container).toMatchSnapshot()

    fireEvent.click(getByText(candidate0.name).closest('button')!)
    expect(updateVote).toHaveBeenCalledTimes(1)

    fireEvent.click(getByText(candidate1.name).closest('button')!)
    expect(updateVote).toHaveBeenCalledTimes(2)

    fireEvent.click(getByText(candidate2.name).closest('button')!)
    expect(updateVote).toHaveBeenCalledTimes(3)
  })

  it("doesn't allow other candidates to be selected when a candidate is selected", () => {
    const updateVote = jest.fn()
    const { container, getByText } = render(
      <CandidateContest
        contest={contest}
        parties={parties}
        vote={[candidate0]}
        updateVote={updateVote}
      />
    )
    expect(container).toMatchSnapshot()

    expect(getByText(candidate0.name).closest('button')!.dataset.selected).toBe(
      'true'
    )

    fireEvent.click(getByText(candidate1.name).closest('button')!)
    expect(updateVote).not.toHaveBeenCalled()

    fireEvent.click(getByText(candidate2.name).closest('button')!)
    expect(updateVote).not.toHaveBeenCalled()

    fireEvent.click(getByText(candidate0.name).closest('button')!)
    expect(updateVote).toHaveBeenCalled()
  })
})

describe('supports multi-seat contests', () => {
  it('allows a second candidate to be selected when one is selected', () => {
    const updateVote = jest.fn()
    const { container, getByText } = render(
      <CandidateContest
        contest={{ ...contest, seats: 2 }}
        parties={parties}
        vote={[candidate0]}
        updateVote={updateVote}
      />
    )
    expect(container).toMatchSnapshot()

    expect(getByText(candidate0.name).closest('button')!.dataset.selected).toBe(
      'true'
    )
    expect(getByText(candidate1.name).closest('button')!.dataset.selected).toBe(
      'false'
    )
    expect(getByText(candidate2.name).closest('button')!.dataset.selected).toBe(
      'false'
    )

    fireEvent.click(getByText(candidate1.name).closest('button')!)
    expect(updateVote).toHaveBeenCalledTimes(1)

    fireEvent.click(getByText(candidate2.name).closest('button')!)
    expect(updateVote).toHaveBeenCalledTimes(2)

    fireEvent.click(getByText(candidate0.name).closest('button')!)
    expect(updateVote).toHaveBeenCalledTimes(3)
  })
})

describe('supports write-in candidates', () => {
  it('updates votes when a write-in candidate is selected', () => {
    jest.useFakeTimers()
    const updateVote = jest.fn()
    const { getByText, queryByText } = render(
      <CandidateContest
        contest={{ ...contest, allowWriteIns: true }}
        parties={parties}
        vote={[]}
        updateVote={updateVote}
      />
    )
    fireEvent.click(getByText('add write-in candidate').closest('button')!)
    getByText('Write-In Candidate')
    typeKeysInVirtualKeyboard(getByText, 'LIZARD PEOPLE')
    fireEvent.click(getByText('Accept'))
    expect(queryByText('Write-In Candidate')).toBeFalsy()

    expect(updateVote).toHaveBeenCalledWith(contest.id, [
      { id: 'write-in__lizardPeople', isWriteIn: true, name: 'LIZARD PEOPLE' },
    ])
  })

  it('displays warning if write-in candidate name is too long', () => {
    jest.useFakeTimers()
    const updateVote = jest.fn()
    const { getByText, queryByText } = render(
      <CandidateContest
        contest={{ ...contest, allowWriteIns: true }}
        parties={parties}
        vote={[]}
        updateVote={updateVote}
      />
    )
    fireEvent.click(getByText('add write-in candidate').closest('button')!)
    getByText('Write-In Candidate')
    typeKeysInVirtualKeyboard(
      getByText,
      'JACOB JOHANSON JINGLEHEIMMER SCHMIDTT'
    )
    getByText('You have entered 37 of maximum 40 characters.')
    fireEvent.click(getByText('Cancel'))
    expect(queryByText('Write-In Candidate')).toBeFalsy()
  })

  it('prevents writing more than the allowed number of characters', () => {
    jest.useFakeTimers()
    const updateVote = jest.fn()
    const { getByText, queryByText } = render(
      <CandidateContest
        contest={{ ...contest, allowWriteIns: true }}
        parties={parties}
        vote={[]}
        updateVote={updateVote}
      />
    )
    fireEvent.click(getByText('add write-in candidate').closest('button')!)
    getByText('Write-In Candidate')
    const writeInCandidate =
      "JACOB JOHANSON JINGLEHEIMMER SCHMIDTT, THAT'S MY NAME TOO"
    typeKeysInVirtualKeyboard(getByText, writeInCandidate)
    getByText('You have entered 40 of maximum 40 characters.')

    expect(getByText('space').closest('button')!.hasAttribute('disabled')).toBe(
      true
    )
    fireEvent.click(getByText('Accept'))
    expect(queryByText('Write-In Candidate')).toBeFalsy()

    expect(updateVote).toHaveBeenCalledWith(contest.id, [
      {
        id: 'write-in__jacobJohansonJingleheimmerSchmidttT',
        isWriteIn: true,
        name: 'JACOB JOHANSON JINGLEHEIMMER SCHMIDTT, T',
      },
    ])
  })

  function typeKeysInVirtualKeyboard(
    getByText: (text: string) => HTMLElement,
    chars: string
  ): void {
    Array.from(chars).forEach((i) => {
      const key = i === ' ' ? 'space' : i
      fireEvent.click(getByText(key).closest('button')!)
    })
  }
})
