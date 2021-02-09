import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { Router } from 'react-router-dom'
import { createMemoryHistory } from 'history'
import { BallotType } from '@votingworks/types'
import DebugScreen from './DebugScreen'
import { Sheet } from '../components/DebugSheetList'
import { ReviewBallot } from '../config/types'

test('renders a list of scanned sheets at /debug', async () => {
  const sheets: Sheet[] = [
    {
      id: 'abcde',
      batchId: 'batch-1',
      frontInterpretation: { type: 'BlankPage' },
      backInterpretation: { type: 'BlankPage' },
    },
    {
      id: 'edcba',
      batchId: 'batch-1',
      frontInterpretation: { type: 'BlankPage' },
      backInterpretation: { type: 'BlankPage' },
    },
  ]

  fetchMock.getOnce('/scan/sheets', sheets)
  render(
    <Router history={createMemoryHistory({ initialEntries: ['/debug'] })}>
      <DebugScreen isTestMode />
    </Router>
  )

  await waitFor(() => fetchMock.called('/scan/sheets'))

  screen.getByText('abcde')
  screen.getByText('edcba')
})

test('renders a single sheet at /debug/sheet/:sheetId/:side', async () => {
  const sheet: Sheet = {
    id: 'abcde',
    batchId: 'batch-1',
    frontInterpretation: {
      type: 'InterpretedBmdPage',
      ballotId: 'tuvwx',
      metadata: {
        ballotStyleId: '12',
        precinctId: '23',
        ballotType: BallotType.Standard,
        isTestMode: true,
        electionHash: '',
        locales: { primary: 'en-US' },
        ballotId: 'tuvwx',
      },
      votes: {},
    },
    backInterpretation: { type: 'BlankPage' },
  }
  const reviewBallot: ReviewBallot = {
    // this type doesn't really make sense with a bmd page and should be changed
    type: 'ReviewMarginalMarksBallot',
    adjudicationInfo: {
      allReasonInfos: [],
      enabledReasons: [],
      requiresAdjudication: false,
    },
    ballot: {
      id: 'abcde',
      image: {
        width: 1,
        height: 1,
        url: '/scan/hmpb/ballot/abcde/front/image/normalized',
      },
      url: '/scan/hmpb/ballot/abcde/front',
    },
    contests: [],
    layout: [],
    marks: {},
  }

  fetchMock.getOnce('/scan/sheets/abcde', [sheet])
  fetchMock.getOnce('/scan/hmpb/ballot/abcde/front', reviewBallot)
  render(
    <Router
      history={createMemoryHistory({
        initialEntries: ['/debug/sheet/abcde/front'],
      })}
    >
      <DebugScreen isTestMode />
    </Router>
  )

  await waitFor(
    () =>
      fetchMock.called('/scan/sheets/abcde') &&
      fetchMock.called('/scan/hmpb/ballot/abcde/front')
  )

  screen.getByText('InterpretedBmdPage')
  expect(screen.getByAltText('page').getAttribute('src')).toEqual(
    '/scan/hmpb/ballot/abcde/front/image/normalized'
  )
})
