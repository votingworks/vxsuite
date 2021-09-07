import { waitFor, fireEvent } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { BallotType, AdjudicationReason } from '@votingworks/types'
import { typedAs } from '@votingworks/utils'
import { GetNextReviewSheetResponse } from '@votingworks/types/api/module-scan'
import BallotEjectScreen from './BallotEjectScreen'
import renderInAppContext from '../../test/renderInAppContext'

test('says the sheet is unreadable if it is', async () => {
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
        id: 'mock-sheet-id',
        front: {
          image: { url: '/front/url' },
          interpretation: { type: 'BlankPage' },
        },
        back: {
          image: { url: '/back/url' },
          interpretation: { type: 'BlankPage' },
        },
      },
    })
  )

  const continueScanning = jest.fn()

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />
  )

  await act(async () => {
    await waitFor(() => fetchMock.called)
  })

  expect(container).toMatchSnapshot()

  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith()
})

test('says the ballot sheet is overvoted if it is', async () => {
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
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
      },
    })
  )

  const continueScanning = jest.fn()

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />
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

test('says the ballot sheet is undervoted if it is', async () => {
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
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
                  type: AdjudicationReason.Undervote,
                  contestId: '1',
                  optionIds: [],
                  expected: 1,
                },
              ],
              enabledReasons: [AdjudicationReason.Undervote],
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
      },
    })
  )

  const continueScanning = jest.fn()

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />
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
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
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
      },
    })
  )

  const continueScanning = jest.fn()

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />
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

test('calls out live ballot sheets in test mode', async () => {
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
        id: 'mock-sheet-id',
        front: {
          image: { url: '/front/url' },
          interpretation: {
            type: 'InvalidTestModePage',
            metadata: {
              ballotStyleId: '1',
              precinctId: '1',
              ballotType: BallotType.Standard,
              electionHash: '',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 1,
            },
          },
        },
        back: {
          image: { url: '/back/url' },
          interpretation: {
            type: 'InvalidTestModePage',
            metadata: {
              ballotStyleId: '1',
              precinctId: '1',
              ballotType: BallotType.Standard,
              electionHash: '',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 2,
            },
          },
        },
      },
    })
  )

  const continueScanning = jest.fn()

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />
  )

  await act(async () => {
    await waitFor(() => fetchMock.called)
  })

  expect(container).toMatchSnapshot()

  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith()
})

test('calls out test ballot sheets in live mode', async () => {
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
        id: 'mock-sheet-id',
        front: {
          image: { url: '/front/url' },
          interpretation: {
            type: 'InvalidTestModePage',
            metadata: {
              ballotStyleId: '1',
              precinctId: '1',
              ballotType: BallotType.Standard,
              electionHash: '',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 1,
            },
          },
        },
        back: {
          image: { url: '/back/url' },
          interpretation: {
            type: 'InvalidTestModePage',
            metadata: {
              ballotStyleId: '1',
              precinctId: '1',
              ballotType: BallotType.Standard,
              electionHash: '',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 2,
            },
          },
        },
      },
    })
  )

  const continueScanning = jest.fn()

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode={false} />
  )

  await act(async () => {
    await waitFor(() => fetchMock.called)
  })

  expect(container).toMatchSnapshot()

  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith()
})

test('shows invalid election screen when appropriate', async () => {
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
        id: 'mock-sheet-id',
        front: {
          image: { url: '/front/url' },
          interpretation: {
            type: 'InvalidElectionHashPage',
            actualElectionHash: 'this-is-a-hash-hooray',
            expectedElectionHash: 'something',
          },
        },
        back: {
          image: { url: '/back/url' },
          interpretation: { type: 'BlankPage' },
        },
      },
    })
  )

  const continueScanning = jest.fn()

  const { getByText, queryAllByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode={false} />
  )

  await act(async () => {
    await waitFor(() => fetchMock.called)
  })

  getByText('Wrong Election')
  getByText('Ballot Election Hash: this-is-a-')
  expect(queryAllByText('Tabulate Duplicate Ballot').length).toBe(0)

  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith()
})

test('shows invalid election screen when appropriate', async () => {
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
        id: 'mock-sheet-id',
        front: {
          image: { url: '/front/url' },
          interpretation: {
            type: 'InvalidPrecinctPage',
            metadata: {
              ballotStyleId: '1',
              precinctId: '1',
              ballotType: BallotType.Standard,
              electionHash: '',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 1,
            },
          },
        },
        back: {
          image: { url: '/back/url' },
          interpretation: {
            type: 'InvalidPrecinctPage',
            metadata: {
              ballotStyleId: '1',
              precinctId: '1',
              ballotType: BallotType.Standard,
              electionHash: '',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 2,
            },
          },
        },
      },
    })
  )

  const continueScanning = jest.fn()

  const { getByText, queryAllByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode={false} />
  )

  await act(async () => {
    await waitFor(() => fetchMock.called)
  })

  getByText('Wrong Precinct')
  expect(queryAllByText('Tabulate Duplicate Ballot').length).toBe(0)

  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith()
})
