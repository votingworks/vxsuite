import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import electionSample from './data/electionSample.json'

import App, { electionKey, mergeWithDefaults } from './App'
import { Election, YesNoContest } from './config/types'

const election = electionSample as Election

const electionSampleAsString = JSON.stringify(
  mergeWithDefaults(electionSample as Election)
)

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`Yes/No Contest`, () => {
  const yesNoContest = election.contests.find(
    c => c.type === 'yesno'
  ) as YesNoContest

  window.localStorage.setItem(electionKey, electionSampleAsString)
  const { getByText, getByTestId, queryByText } = render(<App />)
  fireEvent.change(getByTestId('activation-code'), {
    target: { value: 'MyVoiceIsMyPassword' },
  })

  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))
  fireEvent.click(getByText('Get Started'))

  // click Next until getting to multi-seat contest
  while (!queryByText(yesNoContest.title)) {
    fireEvent.click(getByText('Next'))
  }

  const yesLabel = getByText('Yes').closest('label') as HTMLLabelElement
  const getYesLabelInput = () =>
    getByText('Yes')
      .closest('label')!
      .querySelector('input') as HTMLInputElement
  // Select "Yes"
  fireEvent.click(yesLabel)
  expect(getYesLabelInput().checked).toBe(true)
  // Unselect "Yes"
  fireEvent.click(yesLabel)
  expect(getYesLabelInput().checked).not.toBe(true)
  // Select "Yes"
  fireEvent.click(yesLabel)
  expect(getYesLabelInput().checked).toBe(true)
  // Select "No"
  fireEvent.click(getByText('No').closest('label') as HTMLLabelElement)
  expect(getByTestId('modal-content').textContent).toEqual(
    'Do you want to change your vote to No? To change your vote, first unselect your vote for Yes.'
  )
  fireEvent.click(getByText('Okay'))

  // Go to review page and confirm write in exists
  while (!queryByText('Review Your Ballot Selections')) {
    fireEvent.click(getByText('Next'))
  }
  const reviewTitle = getByText(
    `${yesNoContest.section}, ${yesNoContest.title}`
  )
  const siblingTextContent =
    (reviewTitle.nextSibling && reviewTitle.nextSibling.textContent) || ''
  expect(siblingTextContent.trim()).toBe('Yes')
})
