import { waitFor, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      layouts: {},
      definitions: {},
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
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false })
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
                  optionIndexes: [0, 1],
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
      layouts: {},
      definitions: {},
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
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false })

  continueScanning.mockClear()

  fireEvent.click(getByText('Tabulate Duplicate Ballot'))
  fireEvent.click(getByText('Tabulate Ballot and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith({
    forceAccept: true,
    frontMarkAdjudications: [],
    backMarkAdjudications: [],
  })
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
                  optionIndexes: [],
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
      layouts: {},
      definitions: {},
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
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false })

  continueScanning.mockClear()

  fireEvent.click(getByText('Tabulate Duplicate Ballot'))
  fireEvent.click(getByText('Tabulate Ballot and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith({
    forceAccept: true,
    frontMarkAdjudications: [],
    backMarkAdjudications: [],
  })
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
              allReasonInfos: [
                {
                  type: AdjudicationReason.Undervote,
                  contestId: '1',
                  expected: 1,
                  optionIds: [],
                  optionIndexes: [],
                },
                { type: AdjudicationReason.BlankBallot },
              ],
              enabledReasons: [
                AdjudicationReason.BlankBallot,
                AdjudicationReason.Undervote,
              ],
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
              requiresAdjudication: true,
              allReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
              enabledReasons: [
                AdjudicationReason.BlankBallot,
                AdjudicationReason.Undervote,
              ],
            },
            votes: {},
          },
        },
      },
      layouts: {},
      definitions: {},
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
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false })

  continueScanning.mockClear()

  fireEvent.click(getByText('Tabulate Duplicate Ballot'))
  fireEvent.click(getByText('Tabulate Ballot and Continue Scanning'))
  expect(continueScanning).toHaveBeenCalledWith({
    forceAccept: true,
    frontMarkAdjudications: [],
    backMarkAdjudications: [],
  })
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
      layouts: {},
      definitions: {},
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
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false })
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
      layouts: {},
      definitions: {},
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
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false })
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
      layouts: {},
      definitions: {},
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
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false })
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
      layouts: {},
      definitions: {},
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
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false })
})

test('does NOT say ballot is blank if one side is blank and the other requires write-in adjudication', async () => {
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
        id: 'mock-sheet-id',
        front: {
          image: { url: '/writeinballot/front/url' },
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
              enabledReasons: [
                AdjudicationReason.BlankBallot,
                AdjudicationReason.WriteIn,
              ],
            },
            votes: {},
          },
        },
        back: {
          image: { url: '/writeinballot/back/url' },
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
              requiresAdjudication: true,
              allReasonInfos: [
                {
                  type: AdjudicationReason.WriteIn,
                  contestId: 'county-commissioners',
                  optionIndex: 0,
                  optionId: '__write-in-0',
                },
              ],
              enabledReasons: [
                AdjudicationReason.BlankBallot,
                AdjudicationReason.WriteIn,
              ],
            },
            votes: {},
          },
        },
      },
      layouts: {
        front: {
          ballotImage: {
            metadata: {
              ballotStyleId: '1',
              precinctId: '1',
              ballotType: BallotType.Standard,
              electionHash: '',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 1,
            },
            imageData: {
              width: 20,
              height: 20,
            },
          },
          contests: [],
        },
        back: {
          ballotImage: {
            metadata: {
              ballotStyleId: '1',
              precinctId: '1',
              ballotType: BallotType.Standard,
              electionHash: '',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 2,
            },
            imageData: {
              width: 20,
              height: 20,
            },
          },
          contests: [
            {
              bounds: { x: 0, y: 0, width: 10, height: 10 },
              corners: [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
                { x: 2, y: 2 },
                { x: 3, y: 3 },
              ],
              options: [
                {
                  bounds: { x: 0, y: 0, width: 10, height: 10 },
                  target: {
                    bounds: { x: 0, y: 0, width: 10, height: 10 },
                    inner: { x: 0, y: 0, width: 10, height: 10 },
                  },
                },
              ],
            },
          ],
        },
      },
      definitions: {
        front: {
          contestIds: [],
        },
        back: {
          contestIds: ['county-commissioners'],
        },
      },
    })
  )

  const continueScanning = jest.fn()

  renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />
  )

  await act(async () => {
    await waitFor(() => fetchMock.called)
  })

  expect(screen.queryByText('Blank Ballot')).toBeNull()
  expect(screen.queryByText('Unknown Reason')).toBeNull()
  screen.getByText('Write-In')

  userEvent.type(
    screen.getByTestId(`write-in-input-__write-in-0`),
    'Lizard People'
  )

  // doubly nested acts() because there's setIsSaving(true) and then (false).
  await act(async () => {
    await act(async () => {
      userEvent.click(screen.getByText('Save & Continue Scanning'))
    })
  })

  expect(continueScanning).toHaveBeenCalledWith({
    forceAccept: true,
    frontMarkAdjudications: [],
    backMarkAdjudications: [
      {
        contestId: 'county-commissioners',
        isMarked: true,
        name: 'Lizard People',
        optionId: '__write-in-0',
        type: 'WriteIn',
      },
    ],
  })
  continueScanning.mockClear()
})
