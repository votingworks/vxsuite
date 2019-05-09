import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import { YesNoContest as YesNoContestInterface } from '../config/types'

import YesNoContest from './YesNoContest'

const contest: YesNoContestInterface = {
  description: 'description',
  districtId: 'district-id',
  id: 'contest-id',
  section: 'County',
  shortTitle: 'Prop 1',
  title: 'Prop 1: Garbage Collection Program',
  type: 'yesno',
}

describe('supports yes/no contest', () => {
  it(`allows voting for both yes and no`, () => {
    const updateVote = jest.fn()
    const { container, getByText } = render(
      <YesNoContest
        contest={contest}
        vote={undefined}
        updateVote={updateVote}
      />
    )
    expect(container).toMatchSnapshot()

    fireEvent.click(getByText('Yes').closest('label')!)
    expect(updateVote).toHaveBeenCalledTimes(1)

    fireEvent.click(getByText('No').closest('label')!)
    expect(updateVote).toHaveBeenCalledTimes(2)
  })

  it(`displays warning when attempting to change vote`, () => {
    const updateVote = jest.fn()
    const { container, getByText, getAllByText } = render(
      <YesNoContest contest={contest} vote="yes" updateVote={updateVote} />
    )
    expect(container).toMatchSnapshot()
    fireEvent.click(getByText('No').closest('label')!)
    expect(
      getAllByText(
        (_, element) =>
          element.textContent ===
          'Do you want to change your vote to No? To change your vote, first unselect your vote for Yes.'
      )
    ).toBeTruthy()
    fireEvent.click(getByText('Okay'))
  })
})
