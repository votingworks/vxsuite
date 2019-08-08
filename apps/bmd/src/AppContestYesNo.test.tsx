import React from 'react'
import { fireEvent, render, wait, within } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import {
  noCard,
  voterCard,
  advanceTimers,
} from './__tests__/helpers/smartcards'

import {
  measure102Contest,
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from './__tests__/helpers/election'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

jest.useFakeTimers()

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`Single Seat Contest`, async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  setElectionInLocalStorage()
  setStateInLocalStorage()

  const { getByText, queryByText, getByTestId } = render(<App />)

  // Insert Voter Card
  currentCard = voterCard
  advanceTimers()

  // Go to Voting Instructions
  await wait(() => fireEvent.click(getByText('Get Started')))
  advanceTimers()

  // Go to First Contest
  fireEvent.click(getByText('Start Voting'))
  advanceTimers()

  // ====================== END CONTEST SETUP ====================== //

  // Query by text which includes markup.
  const getByTextWithMarkup = (text: string) => {
    getByText((content, node) => {
      const hasText = (node: HTMLElement) => node.textContent === text
      const childrenDontHaveText = Array.from(node.children).every(
        child => !hasText(child as HTMLElement)
      )
      return hasText(node) && childrenDontHaveText
    })
  }

  // Advance to multi-seat contest
  while (!queryByText(measure102Contest.title)) {
    fireEvent.click(getByText('Next'))
    advanceTimers()
  }

  getByText(measure102Contest.title)

  // Select Yes
  fireEvent.click(getByText('Yes'))
  expect(getByText('Yes').closest('button')!.dataset.selected).toBe('true')

  // Unselect Yes
  fireEvent.click(getByText('Yes'))
  expect(getByText('Yes').closest('button')!.dataset.selected).toBe('false')

  // Select Yes
  fireEvent.click(getByText('Yes'))
  expect(getByText('Yes').closest('button')!.dataset.selected).toBe('true')

  // Select No
  fireEvent.click(getByText('No'))
  expect(
    within(getByTestId('contest-choices'))
      .getByText('No')
      .closest('button')!.dataset.selected
  ).toBe('false')

  // Overvote modal is displayed
  getByTextWithMarkup(
    'Do you want to change your vote to No? To change your vote, first unselect your vote for Yes.'
  )
  fireEvent.click(getByText('Okay'))

  // Go to review page and confirm write in exists
  while (!queryByText('Review Your Selections')) {
    fireEvent.click(getByText('Next'))
    advanceTimers()
  }
  fireEvent.click(getByText('Review Selections'))
  advanceTimers()

  const reviewTitle = getByText(
    `${measure102Contest.section}, ${measure102Contest.title}`
  )
  const siblingTextContent =
    (reviewTitle.nextSibling && reviewTitle.nextSibling.textContent) || ''
  expect(siblingTextContent.trim()).toBe(
    `Yes on ${measure102Contest.shortTitle}`
  )
})
