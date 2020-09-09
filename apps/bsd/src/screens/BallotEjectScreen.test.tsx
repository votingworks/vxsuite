import { render, waitFor, fireEvent } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { BallotType, AdjudicationReason } from '@votingworks/ballot-encoder'
import { BallotSheetInfo } from '../config/types'
import BallotEjectScreen from './BallotEjectScreen'

test('says the sheet is unreadable if it is', async () => {
  const response: BallotSheetInfo = {
    id: 'mock-sheet-id',
    front: {
      image: { url: '/front/url' },
      interpretation: { type: 'BlankPage' },
    },
    back: {
      image: { url: '/back/url' },
      interpretation: { type: 'BlankPage' },
    },
  }
  fetchMock.getOnce('/scan/hmpb/review/next-sheet', response)

  const continueScanning = jest.fn()

  const { container, getByText } = render(
    <BallotEjectScreen continueScanning={continueScanning} />
  )

  await act(async () => {
    await waitFor(() => fetchMock.called)
  })

  expect(container).toMatchSnapshot()

  fireEvent.click(getByText('Original Ballot Removed'))
  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith()

  continueScanning.mockClear()

  fireEvent.click(getByText('Tabulate Duplicate Ballot'))
  fireEvent.click(getByText('Tabulate Ballot and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith(true)
})

test('says the ballot sheet is overvoted if it is', async () => {
  const response: BallotSheetInfo = {
    id: 'mock-sheet-id',
    front: {
      image: { url: '/front/url' },
      interpretation: {
        type: 'InterpretedHmpbPage',
        markInfo: {
          ballotSize: { width: 1, height: 1 },
          marks: [],
        },
        metadata: {
          ballotStyleId: '1',
          precinctId: '1',
          ballotType: BallotType.Standard,
          electionHash: '',
          isTestMode: false,
          locales: { primary: 'en-US' },
          pageNumber: 1,
        },
        adjudicationInfo: {
          requiresAdjudication: true,
          allReasonInfos: [
            {
              type: AdjudicationReason.Overvote,
              contestId: '1',
              optionIds: ['1', '2'],
              expected: 1,
            },
          ],
          enabledReasons: [AdjudicationReason.Overvote],
        },
        votes: {},
      },
    },
    back: {
      image: { url: '/back/url' },
      interpretation: {
        type: 'InterpretedHmpbPage',
        markInfo: {
          ballotSize: { width: 1, height: 1 },
          marks: [],
        },
        metadata: {
          ballotStyleId: '1',
          precinctId: '1',
          ballotType: BallotType.Standard,
          electionHash: '',
          isTestMode: false,
          locales: { primary: 'en-US' },
          pageNumber: 2,
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          allReasonInfos: [],
          enabledReasons: [AdjudicationReason.Overvote],
        },
        votes: {},
      },
    },
  }
  fetchMock.getOnce('/scan/hmpb/review/next-sheet', response)

  const continueScanning = jest.fn()

  const { container, getByText } = render(
    <BallotEjectScreen continueScanning={continueScanning} />
  )

  await act(async () => {
    await waitFor(() => fetchMock.called)
  })

  expect(container).toMatchSnapshot()

  fireEvent.click(getByText('Original Ballot Removed'))
  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith()

  continueScanning.mockClear()

  fireEvent.click(getByText('Tabulate Duplicate Ballot'))
  fireEvent.click(getByText('Tabulate Ballot and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith(true)
})

test('says the ballot sheet is blank if it is', async () => {
  const response: BallotSheetInfo = {
    id: 'mock-sheet-id',
    front: {
      image: { url: '/front/url' },
      interpretation: {
        type: 'InterpretedHmpbPage',
        markInfo: {
          ballotSize: { width: 1, height: 1 },
          marks: [],
        },
        metadata: {
          ballotStyleId: '1',
          precinctId: '1',
          ballotType: BallotType.Standard,
          electionHash: '',
          isTestMode: false,
          locales: { primary: 'en-US' },
          pageNumber: 1,
        },
        adjudicationInfo: {
          requiresAdjudication: true,
          allReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
          enabledReasons: [AdjudicationReason.Overvote],
        },
        votes: {},
      },
    },
    back: {
      image: { url: '/back/url' },
      interpretation: {
        type: 'InterpretedHmpbPage',
        markInfo: {
          ballotSize: { width: 1, height: 1 },
          marks: [],
        },
        metadata: {
          ballotStyleId: '1',
          precinctId: '1',
          ballotType: BallotType.Standard,
          electionHash: '',
          isTestMode: false,
          locales: { primary: 'en-US' },
          pageNumber: 2,
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          allReasonInfos: [],
          enabledReasons: [AdjudicationReason.Overvote],
        },
        votes: {},
      },
    },
  }
  fetchMock.getOnce('/scan/hmpb/review/next-sheet', response)

  const continueScanning = jest.fn()

  const { container, getByText } = render(
    <BallotEjectScreen continueScanning={continueScanning} />
  )

  await act(async () => {
    await waitFor(() => fetchMock.called)
  })

  expect(container).toMatchSnapshot()

  fireEvent.click(getByText('Original Ballot Removed'))
  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith()

  continueScanning.mockClear()

  fireEvent.click(getByText('Tabulate Duplicate Ballot'))
  fireEvent.click(getByText('Tabulate Ballot and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith(true)
})
