import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { AdjudicationReason, BallotType } from '@votingworks/types';
import { GetNextReviewSheetResponse } from '@votingworks/types/api/services/scan';
import { typedAs } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { renderInAppContext } from '../../test/render_in_app_context';
import { BallotEjectScreen } from './ballot_eject_screen';

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
  );

  const logger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(logger, 'log');
  const continueScanning = jest.fn();

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  expect(container).toMatchSnapshot();

  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'admin',
    expect.objectContaining({
      adjudicationTypes: 'BlankPage',
    })
  );
  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });
});

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
              electionHash: 'abcde',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 1,
            },
            adjudicationInfo: {
              requiresAdjudication: true,
              enabledReasonInfos: [
                {
                  type: AdjudicationReason.Overvote,
                  contestId: '1',
                  optionIds: ['1', '2'],
                  optionIndexes: [0, 1],
                  expected: 1,
                },
              ],
              ignoredReasonInfos: [],
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
              electionHash: 'abcde',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 2,
            },
            adjudicationInfo: {
              requiresAdjudication: false,
              enabledReasonInfos: [],
              ignoredReasonInfos: [],
              enabledReasons: [AdjudicationReason.Overvote],
            },
            votes: {},
          },
        },
      },
      layouts: {},
      definitions: {},
    })
  );

  const continueScanning = jest.fn();
  const logger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(logger, 'log');

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  expect(container).toMatchSnapshot();

  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'admin',
    expect.objectContaining({
      adjudicationTypes: 'Overvote',
    })
  );

  fireEvent.click(getByText('Original Ballot Removed'));
  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });

  continueScanning.mockClear();

  fireEvent.click(getByText('Tabulate Duplicate Ballot'));
  fireEvent.click(getByText('Tabulate Ballot and Continue Scanning'));
  expect(continueScanning).toHaveBeenCalledWith({
    forceAccept: true,
    frontMarkAdjudications: [],
    backMarkAdjudications: [],
  });
});

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
              electionHash: 'abcde',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 1,
            },
            adjudicationInfo: {
              requiresAdjudication: true,
              enabledReasonInfos: [
                {
                  type: AdjudicationReason.Undervote,
                  contestId: '1',
                  optionIds: [],
                  optionIndexes: [],
                  expected: 1,
                },
              ],
              ignoredReasonInfos: [],
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
              electionHash: 'abcde',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 2,
            },
            adjudicationInfo: {
              requiresAdjudication: false,
              enabledReasonInfos: [],
              ignoredReasonInfos: [],
              enabledReasons: [AdjudicationReason.Overvote],
            },
            votes: {},
          },
        },
      },
      layouts: {},
      definitions: {},
    })
  );

  const continueScanning = jest.fn();
  const logger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(logger, 'log');

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  expect(container).toMatchSnapshot();
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'admin',
    expect.objectContaining({
      adjudicationTypes: 'Undervote',
    })
  );

  fireEvent.click(getByText('Original Ballot Removed'));
  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });

  continueScanning.mockClear();

  fireEvent.click(getByText('Tabulate Duplicate Ballot'));
  fireEvent.click(getByText('Tabulate Ballot and Continue Scanning'));
  expect(continueScanning).toHaveBeenCalledWith({
    forceAccept: true,
    frontMarkAdjudications: [],
    backMarkAdjudications: [],
  });
});

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
              electionHash: 'abcde',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 1,
            },
            adjudicationInfo: {
              requiresAdjudication: true,
              enabledReasonInfos: [
                {
                  type: AdjudicationReason.Undervote,
                  contestId: '1',
                  expected: 1,
                  optionIds: [],
                  optionIndexes: [],
                },
                { type: AdjudicationReason.BlankBallot },
              ],
              ignoredReasonInfos: [],
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
              electionHash: 'abcde',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 2,
            },
            adjudicationInfo: {
              requiresAdjudication: true,
              enabledReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
              ignoredReasonInfos: [],
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
  );

  const continueScanning = jest.fn();
  const logger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(logger, 'log');

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  expect(container).toMatchSnapshot();
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'admin',
    expect.objectContaining({
      adjudicationTypes: 'BlankBallot, Undervote',
    })
  );

  fireEvent.click(getByText('Original Ballot Removed'));
  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });

  continueScanning.mockClear();

  fireEvent.click(getByText('Tabulate Duplicate Ballot'));
  fireEvent.click(getByText('Tabulate Ballot and Continue Scanning'));
  expect(continueScanning).toHaveBeenCalledWith({
    forceAccept: true,
    frontMarkAdjudications: [],
    backMarkAdjudications: [],
  });
});

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
              electionHash: 'abcde',
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
              electionHash: 'abcde',
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
  );

  const continueScanning = jest.fn();
  const logger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(logger, 'log');

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  expect(container).toMatchSnapshot();
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'admin',
    expect.objectContaining({
      adjudicationTypes: 'InvalidTestModePage',
    })
  );

  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });
});

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
              electionHash: 'abcde',
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
              electionHash: 'abcde',
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
  );

  const continueScanning = jest.fn();
  const logger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(logger, 'log');

  const { container, getByText } = renderInAppContext(
    <BallotEjectScreen
      continueScanning={continueScanning}
      isTestMode={false}
    />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  expect(container).toMatchSnapshot();
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'admin',
    expect.objectContaining({
      adjudicationTypes: 'InvalidTestModePage',
    })
  );

  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });
});

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
  );

  const continueScanning = jest.fn();
  const logger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(logger, 'log');

  const { getByText, queryAllByText } = renderInAppContext(
    <BallotEjectScreen
      continueScanning={continueScanning}
      isTestMode={false}
    />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  getByText('Wrong Election');
  getByText('Ballot Election Hash: this-is-a-');
  expect(queryAllByText('Tabulate Duplicate Ballot').length).toBe(0);
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'admin',
    expect.objectContaining({
      adjudicationTypes: 'InvalidElectionHashPage, BlankPage',
    })
  );

  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });
});

test('shows invalid precinct screen when appropriate', async () => {
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
              electionHash: 'abcde',
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
              electionHash: 'abcde',
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
  );

  const logger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(logger, 'log');
  const continueScanning = jest.fn();

  const { getByText, queryAllByText } = renderInAppContext(
    <BallotEjectScreen
      continueScanning={continueScanning}
      isTestMode={false}
    />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'admin',
    expect.objectContaining({
      adjudicationTypes: 'InvalidPrecinctPage',
    })
  );

  getByText('Wrong Precinct');
  expect(queryAllByText('Tabulate Duplicate Ballot').length).toBe(0);

  fireEvent.click(getByText('Confirm Ballot Removed and Continue Scanning'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });
});

test('does NOT say ballot is blank if one side is blank and the other requires write-in adjudication (marked or unmarked)', async () => {
  for (const writeInReason of [
    AdjudicationReason.WriteIn,
    AdjudicationReason.UnmarkedWriteIn,
  ] as const) {
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
                electionHash: 'abcde',
                isTestMode: false,
                locales: { primary: 'en-US' },
                pageNumber: 1,
              },
              adjudicationInfo: {
                requiresAdjudication: true,
                enabledReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
                ignoredReasonInfos: [],
                enabledReasons: [AdjudicationReason.BlankBallot, writeInReason],
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
                marks: [
                  {
                    type: 'candidate',
                    bounds: {
                      x: 454,
                      y: 163,
                      width: 32,
                      height: 22,
                    },
                    contestId: 'contest1',
                    optionId: 'Candidate1',
                    score: 0.78,
                    scoredOffset: {
                      x: 0,
                      y: 0,
                    },
                    target: {
                      bounds: {
                        x: 454,
                        y: 163,
                        width: 32,
                        height: 22,
                      },
                      inner: {
                        x: 456,
                        y: 165,
                        width: 28,
                        height: 18,
                      },
                    },
                  },
                ],
              },
              metadata: {
                ballotStyleId: '1',
                precinctId: '1',
                ballotType: BallotType.Standard,
                electionHash: 'abcde',
                isTestMode: false,
                locales: { primary: 'en-US' },
                pageNumber: 2,
              },
              adjudicationInfo: {
                requiresAdjudication: true,
                enabledReasonInfos: [
                  {
                    type: writeInReason,
                    contestId: 'county-commissioners',
                    optionIndex: 0,
                    optionId: '__write-in-0',
                  },
                ],
                ignoredReasonInfos: [],
                enabledReasons: [AdjudicationReason.BlankBallot, writeInReason],
              },
              votes: {},
            },
          },
        },
        layouts: {
          front: {
            pageSize: {
              width: 20,
              height: 20,
            },
            metadata: {
              ballotStyleId: '1',
              precinctId: '1',
              ballotType: BallotType.Standard,
              electionHash: 'abcde',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 1,
            },
            contests: [],
          },
          back: {
            pageSize: {
              width: 20,
              height: 20,
            },
            metadata: {
              ballotStyleId: '1',
              precinctId: '1',
              ballotType: BallotType.Standard,
              electionHash: 'abcde',
              isTestMode: false,
              locales: { primary: 'en-US' },
              pageNumber: 2,
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
    );

    const continueScanning = jest.fn();
    const logger = new Logger(LogSource.VxCentralScanFrontend);
    const logSpy = jest.spyOn(logger, 'log');

    const { unmount } = renderInAppContext(
      <BallotEjectScreen continueScanning={continueScanning} isTestMode />,
      { logger }
    );

    await act(async () => {
      await waitFor(() => fetchMock.called);
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      LogEventId.ScanAdjudicationInfo,
      'admin',
      expect.objectContaining({
        adjudicationTypes: ['BlankBallot', writeInReason].join(', '),
      })
    );

    expect(screen.queryByText('Blank Ballot')).toBeNull();
    expect(screen.queryByText('Unknown Reason')).toBeNull();
    screen.getByText('Write-In');

    userEvent.type(
      screen.getByTestId(`write-in-input-__write-in-0`),
      'Lizard People'
    );

    // doubly nested acts() because there's setIsSaving(true) and then (false).
    await act(async () => {
      await act(async () => {
        userEvent.click(screen.getByText('Save & Continue Scanning'));
      });
    });

    expect(continueScanning).toHaveBeenCalledWith({
      forceAccept: true,
      frontMarkAdjudications: [],
      backMarkAdjudications: [
        {
          contestId: 'county-commissioners',
          isMarked: true,
          name: 'Lizard People',
          optionId: '__write-in-0',
          type: writeInReason,
        },
      ],
    });
    continueScanning.mockClear();

    unmount();
    fetchMock.reset();
  }
});
