import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import { Route } from 'react-router-dom'
import {
  Election,
  // electionSample,
  getBallotStyle,
  getContests,
  vote,
} from '@votingworks/ballot-encoder'
// TODO: Tally: Use electionSample from ballot-encoder once published.
import electionSample from './data/electionSample.json'

import App from './App'
import PrintPage from './pages/PrintPage'

import { render as renderWithBallotContext } from '../test/testUtils'
import withMarkup from '../test/helpers/withMarkup'
import { advanceTimers, getNewVoterCard } from '../test/helpers/smartcards'

import {
  measure420Contest,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import { MemoryCard } from './utils/Card'
import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'
import { MemoryHardware } from './utils/Hardware'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'

test('Renders Ballot with EitherNeither: blank', () => {
  const { getByText } = renderWithBallotContext(
    <Route path="/print" component={PrintPage} />,
    {
      ballotStyleId: '12',
      precinctId: '23',
      route: '/print',
      election: electionSample,
      votes: vote(
        getContests({
          ballotStyle: getBallotStyle({
            election: electionSample as Election,
            ballotStyleId: '12',
          })!,
          election: electionSample as Election,
        }),
        {
          '420A': [],
          '420B': [],
        }
      ),
    }
  )
  const getByTextWithMarkup = withMarkup(getByText)
  const contestReviewTitle = getByTextWithMarkup(measure420Contest.title)
  expect(contestReviewTitle?.nextSibling?.textContent?.trim()).toBe(
    '[no selection]'
  )
})

test('Renders Ballot with EitherNeither: Either & blank', () => {
  const { getByText } = renderWithBallotContext(
    <Route path="/print" component={PrintPage} />,
    {
      ballotStyleId: '12',
      precinctId: '23',
      route: '/print',
      election: electionSample,
      votes: vote(
        getContests({
          ballotStyle: getBallotStyle({
            election: electionSample as Election,
            ballotStyleId: '12',
          })!,
          election: electionSample as Election,
        }),
        {
          '420A': ['yes'],
          '420B': [],
        }
      ),
    }
  )
  const getByTextWithMarkup = withMarkup(getByText)
  const contestReviewTitle = getByTextWithMarkup(measure420Contest.title)
  expect(contestReviewTitle?.nextSibling?.textContent?.trim()).toBe(
    `• ${measure420Contest.eitherOption.label}`
  )
  expect(
    contestReviewTitle?.nextSibling?.nextSibling?.textContent?.trim()
  ).toBe('• [no selection]')
})

test('Renders Ballot with EitherNeither: Neither & firstOption', () => {
  const { getByText } = renderWithBallotContext(
    <Route path="/print" component={PrintPage} />,
    {
      ballotStyleId: '12',
      precinctId: '23',
      route: '/print',
      election: electionSample,
      votes: vote(
        getContests({
          ballotStyle: getBallotStyle({
            election: electionSample as Election,
            ballotStyleId: '12',
          })!,
          election: electionSample as Election,
        }),
        {
          '420A': ['no'],
          '420B': ['yes'],
        }
      ),
    }
  )
  const getByTextWithMarkup = withMarkup(getByText)
  const contestReviewTitle = getByTextWithMarkup(measure420Contest.title)
  expect(contestReviewTitle?.nextSibling?.textContent?.trim()).toBe(
    `• ${measure420Contest.neitherOption.label}`
  )
  expect(
    contestReviewTitle?.nextSibling?.nextSibling?.textContent?.trim()
  ).toBe(`• ${measure420Contest.firstOption.label}`)
})

test('Renders Ballot with EitherNeither: blank & secondOption', () => {
  const { getByText } = renderWithBallotContext(
    <Route path="/print" component={PrintPage} />,
    {
      ballotStyleId: '12',
      precinctId: '23',
      route: '/print',
      election: electionSample,
      votes: vote(
        getContests({
          ballotStyle: getBallotStyle({
            election: electionSample as Election,
            ballotStyleId: '12',
          })!,
          election: electionSample as Election,
        }),
        {
          '420A': [],
          '420B': ['no'],
        }
      ),
    }
  )
  const getByTextWithMarkup = withMarkup(getByText)
  const contestReviewTitle = getByTextWithMarkup(measure420Contest.title)
  expect(contestReviewTitle?.nextSibling?.textContent?.trim()).toBe(
    '• [no selection]'
  )
  expect(
    contestReviewTitle?.nextSibling?.nextSibling?.textContent?.trim()
  ).toBe(`• ${measure420Contest.secondOption.label}`)
})

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

test('Can vote on a Mississippi Either Neither Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const storage = new MemoryStorage<AppStorage>()
  const machineConfig = fakeMachineConfigProvider()

  setElectionInStorage(storage)
  setStateInStorage(storage)

  const { getByText, queryByText } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  )

  // Insert Voter Card
  card.insertCard(getNewVoterCard())
  advanceTimers()

  // Go to First Contest
  await wait(() => fireEvent.click(getByText('Start Voting')))
  advanceTimers()

  // ====================== END CONTEST SETUP ====================== //

  const getByTextWithMarkup = withMarkup(getByText)

  // Advance to multi-seat contest
  while (!queryByText(measure420Contest.title)) {
    fireEvent.click(getByText('Next'))
    advanceTimers()
  }

  // Select and Unselect Options
  fireEvent.click(getByText(measure420Contest.eitherOption.label))
  fireEvent.click(getByText(measure420Contest.neitherOption.label))
  fireEvent.click(getByText(measure420Contest.neitherOption.label))

  fireEvent.click(getByText(measure420Contest.firstOption.label))
  fireEvent.click(getByText(measure420Contest.secondOption.label))
  fireEvent.click(getByText(measure420Contest.secondOption.label))

  // Go to Review Screen
  while (!queryByText('Review Your Votes')) {
    fireEvent.click(getByText('Next'))
    advanceTimers()
  }

  // Confirm there is no vote
  let contestReviewTitle = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  )
  expect(contestReviewTitle?.nextSibling?.textContent?.trim()).toBe(
    'You may still vote in this contest.'
  )

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle)
  advanceTimers()

  // Vote for either and first option
  fireEvent.click(getByText(measure420Contest.eitherOption.label))
  fireEvent.click(getByText(measure420Contest.firstOption.label))

  // Go to Review Screen to confirm votes
  fireEvent.click(getByText('Review'))
  advanceTimers()
  contestReviewTitle = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  )
  const eitherAndFirst = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  ).nextSibling
  expect(eitherAndFirst?.textContent?.trim()).toBe('For either')
  expect(eitherAndFirst?.nextSibling?.textContent?.trim()).toBe(
    'FOR Measure 420A'
  )

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle)
  advanceTimers()

  // Vote for neither and second option
  fireEvent.click(getByText(measure420Contest.neitherOption.label))
  fireEvent.click(getByText(measure420Contest.secondOption.label))

  // Go to Review Screen to confirm votes
  fireEvent.click(getByText('Review'))
  advanceTimers()
  contestReviewTitle = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  )
  const neitherAndSecond = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  ).nextSibling
  expect(neitherAndSecond?.textContent?.trim()).toBe('Against both')
  expect(neitherAndSecond?.nextSibling?.textContent?.trim()).toBe(
    'FOR Measure 420B'
  )

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle)
  advanceTimers()

  // Vote for none and second option
  fireEvent.click(getByText(measure420Contest.neitherOption.label))

  // Go to Review Screen to confirm votes
  fireEvent.click(getByText('Review'))
  advanceTimers()
  contestReviewTitle = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  )
  const noneAndSecond = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  ).nextSibling
  expect(noneAndSecond?.textContent?.trim()).toBe(
    'You may still vote in this contest.'
  )
  expect(noneAndSecond?.nextSibling?.textContent?.trim()).toBe(
    'FOR Measure 420B'
  )

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle)
  advanceTimers()

  // Vote for either and no option
  fireEvent.click(getByText(measure420Contest.eitherOption.label))
  fireEvent.click(getByText(measure420Contest.secondOption.label))

  // Go to Review Screen to confirm votes
  fireEvent.click(getByText('Review'))
  advanceTimers()
  contestReviewTitle = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  )
  const eitherAndNone = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  ).nextSibling
  expect(eitherAndNone?.textContent?.trim()).toBe('For either')
  expect(eitherAndNone?.nextSibling?.textContent?.trim()).toBe(
    'You may still vote in this contest.'
  )
})
