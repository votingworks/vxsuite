import { screen, waitFor } from '@testing-library/react';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { AdjudicationReason, BallotType } from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { typedAs } from '@votingworks/basics';
import fetchMock from 'fetch-mock';
import React from 'react';
import { act } from 'react-dom/test-utils';
import userEvent from '@testing-library/user-event';
import { renderInAppContext } from '../../test/render_in_app_context';
import { BallotEjectScreen } from './ballot_eject_screen';

test('says the sheet is unreadable if it is', async () => {
  fetchMock.getOnce(
    '/central-scanner/scan/hmpb/review/next-sheet',
    typedAs<Scan.GetNextReviewSheetResponse>({
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

  const logger = fakeLogger();
  const continueScanning = jest.fn();

  renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  screen.getByText('Unreadable');
  screen.getByText('The last scanned ballot was not tabulated.');
  screen.getByText(
    'There was a problem reading the ballot. Remove ballot and reload in the scanner to try again.'
  );
  expect(screen.getByRole('button').textContent).toEqual(
    'The ballot has been removed'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'BlankPage',
    })
  );
  userEvent.click(screen.getByText('The ballot has been removed'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });
});

test('says the ballot sheet is overvoted if it is', async () => {
  fetchMock.getOnce(
    '/central-scanner/scan/hmpb/review/next-sheet',
    typedAs<Scan.GetNextReviewSheetResponse>({
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
  const logger = fakeLogger();

  renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  screen.getByText('Overvote');
  screen.getByText(
    'The last scanned ballot was not tabulated because an overvote was detected.'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'Overvote',
    })
  );

  userEvent.click(screen.getByText('Remove to Adjudicate'));
  userEvent.click(screen.getByText('Ballot has been removed'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });

  continueScanning.mockClear();

  userEvent.click(screen.getByText('Tabulate As Is'));
  userEvent.click(screen.getByText('Yes, tabulate ballot as is'));
  expect(continueScanning).toHaveBeenCalledWith({
    forceAccept: true,
  });
});

test('says the ballot sheet is undervoted if it is', async () => {
  fetchMock.getOnce(
    '/central-scanner/scan/hmpb/review/next-sheet',
    typedAs<Scan.GetNextReviewSheetResponse>({
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
  const logger = fakeLogger();

  renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  screen.getByText('Undervote');
  screen.getByText(
    'The last scanned ballot was not tabulated because an undervote was detected.'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'Undervote',
    })
  );

  userEvent.click(screen.getByText('Remove to Adjudicate'));
  userEvent.click(screen.getByText('Ballot has been removed'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });

  continueScanning.mockClear();

  userEvent.click(screen.getByText('Tabulate As Is'));
  userEvent.click(screen.getByText('Yes, tabulate ballot as is'));
  expect(continueScanning).toHaveBeenCalledWith({
    forceAccept: true,
  });
});

test('says the ballot sheet is blank if it is', async () => {
  fetchMock.getOnce(
    '/central-scanner/scan/hmpb/review/next-sheet',
    typedAs<Scan.GetNextReviewSheetResponse>({
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
  const logger = fakeLogger();

  renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  screen.getByText('Blank Ballot');
  screen.getByText(
    'The last scanned ballot was not tabulated because no votes were detected.'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'BlankBallot, Undervote',
    })
  );

  userEvent.click(screen.getByText('Remove to Adjudicate'));
  userEvent.click(screen.getByText('Ballot has been removed'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });

  continueScanning.mockClear();

  userEvent.click(screen.getByText('Tabulate As Is'));
  userEvent.click(screen.getByText('Yes, tabulate ballot as is'));
  expect(continueScanning).toHaveBeenCalledWith({
    forceAccept: true,
  });
});

test('calls out live ballot sheets in test mode', async () => {
  fetchMock.getOnce(
    '/central-scanner/scan/hmpb/review/next-sheet',
    typedAs<Scan.GetNextReviewSheetResponse>({
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
  const logger = fakeLogger();

  renderInAppContext(
    <BallotEjectScreen continueScanning={continueScanning} isTestMode />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  screen.getByText('Live Ballot');
  screen.getByText('The last scanned ballot was not tabulated.');
  screen.getByText('Remove the LIVE ballot before continuing.');
  expect(screen.getByRole('button').textContent).toEqual(
    'The ballot has been removed'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'InvalidTestModePage',
    })
  );

  userEvent.click(screen.getByText('The ballot has been removed'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });
});

test('calls out test ballot sheets in live mode', async () => {
  fetchMock.getOnce(
    '/central-scanner/scan/hmpb/review/next-sheet',
    typedAs<Scan.GetNextReviewSheetResponse>({
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
  const logger = fakeLogger();

  renderInAppContext(
    <BallotEjectScreen
      continueScanning={continueScanning}
      isTestMode={false}
    />,
    { logger }
  );

  await act(async () => {
    await waitFor(() => fetchMock.called);
  });

  screen.getByText('Test Ballot');
  screen.getByText('The last scanned ballot was not tabulated.');
  screen.getByText('Remove the TEST ballot before continuing.');
  expect(screen.getByRole('button').textContent).toEqual(
    'The ballot has been removed'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'InvalidTestModePage',
    })
  );

  userEvent.click(screen.getByText('The ballot has been removed'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });
});

test('shows invalid election screen when appropriate', async () => {
  fetchMock.getOnce(
    '/central-scanner/scan/hmpb/review/next-sheet',
    typedAs<Scan.GetNextReviewSheetResponse>({
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
  const logger = fakeLogger();

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
  expect(queryAllByText('Tabulate As Is').length).toEqual(0);
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'InvalidElectionHashPage, BlankPage',
    })
  );

  userEvent.click(screen.getByText('The ballot has been removed'));
  expect(continueScanning).toHaveBeenCalledWith({ forceAccept: false });
});
