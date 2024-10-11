import { mockBaseLogger, LogEventId } from '@votingworks/logging';
import {
  AdjudicationReason,
  BallotMetadata,
  BallotStyleId,
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  formatBallotHash,
} from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { typedAs } from '@votingworks/basics';
import fetchMock from 'fetch-mock';
import userEvent from '@testing-library/user-event';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { BallotEjectScreen } from './ballot_eject_screen';
import { createApiMock, ApiMock } from '../../test/api';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.assertComplete();
});

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

  const logger = mockBaseLogger();

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock, logger });

  await screen.findByText('Unreadable');
  screen.getByText(
    'The last scanned ballot was not tabulated because there was a problem reading the ballot.'
  );
  screen.getByText(
    'Remove the ballot and reload it into the scanner to try again. If the error persists, remove the ballot for manual adjudication.'
  );
  expect(screen.getByRole('button').textContent).toEqual(
    'Confirm Ballot Removed'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'BlankPage',
    })
  );
  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});

test('says the ballot sheet is overvoted if it is', async () => {
  const metadata: BallotMetadata = {
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '1',
    ballotType: BallotType.Precinct,
    ballotHash: 'abcde',
    isTestMode: false,
  };
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
              ...metadata,
              pageNumber: 1,
            },
            adjudicationInfo: {
              requiresAdjudication: true,
              enabledReasonInfos: [
                {
                  type: AdjudicationReason.Overvote,
                  contestId: '1',
                  optionIds: ['1', '2'],
                  expected: 1,
                },
              ],
              ignoredReasonInfos: [],
              enabledReasons: [AdjudicationReason.Overvote],
            },
            votes: {},
            layout: {
              pageSize: { width: 1, height: 1 },
              metadata: {
                ...metadata,
                pageNumber: 1,
              },
              contests: [],
            },
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
              ...metadata,
              pageNumber: 2,
            },
            adjudicationInfo: {
              requiresAdjudication: false,
              enabledReasonInfos: [],
              ignoredReasonInfos: [],
              enabledReasons: [AdjudicationReason.Overvote],
            },
            votes: {},
            layout: {
              pageSize: { width: 1, height: 1 },
              metadata: {
                ...metadata,
                pageNumber: 2,
              },
              contests: [],
            },
          },
        },
      },
      layouts: {},
      definitions: {},
    })
  );

  const logger = mockBaseLogger();

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock, logger });

  await screen.findByText('Overvote');
  screen.getByText(
    'The last scanned ballot was not tabulated because an overvote was detected.'
  );
  screen.getByText(
    'Remove the ballot for manual adjudication or choose to tabulate it anyway.'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'Overvote',
    })
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));

  apiMock.expectContinueScanning({ forceAccept: true });
  userEvent.click(screen.getByText('Tabulate Ballot'));
});

test('says the ballot sheet is undervoted if it is', async () => {
  const metadata: BallotMetadata = {
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '1',
    ballotType: BallotType.Precinct,
    ballotHash: 'abcde',
    isTestMode: false,
  };
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
              ...metadata,
              pageNumber: 1,
            },
            adjudicationInfo: {
              requiresAdjudication: true,
              enabledReasonInfos: [
                {
                  type: AdjudicationReason.Undervote,
                  contestId: '1',
                  optionIds: [],
                  expected: 1,
                },
              ],
              ignoredReasonInfos: [],
              enabledReasons: [AdjudicationReason.Undervote],
            },
            votes: {},
            layout: {
              pageSize: { width: 1, height: 1 },
              metadata: {
                ...metadata,
                pageNumber: 1,
              },
              contests: [],
            },
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
              ...metadata,
              pageNumber: 2,
            },
            adjudicationInfo: {
              requiresAdjudication: false,
              enabledReasonInfos: [],
              ignoredReasonInfos: [],
              enabledReasons: [AdjudicationReason.Overvote],
            },
            votes: {},
            layout: {
              pageSize: { width: 1, height: 1 },
              metadata: {
                ...metadata,
                pageNumber: 2,
              },
              contests: [],
            },
          },
        },
      },
      layouts: {},
      definitions: {},
    })
  );

  const logger = mockBaseLogger();

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock, logger });

  await screen.findByText('Undervote');
  screen.getByText(
    'The last scanned ballot was not tabulated because an undervote was detected.'
  );
  screen.getByText(
    'Remove the ballot for manual adjudication or choose to tabulate it anyway.'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'Undervote',
    })
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));

  apiMock.expectContinueScanning({ forceAccept: true });
  userEvent.click(screen.getByText('Tabulate Ballot'));
});

test('says the ballot sheet is blank if it is', async () => {
  const metadata: BallotMetadata = {
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '1',
    ballotType: BallotType.Precinct,
    ballotHash: 'abcde',
    isTestMode: false,
  };
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
              ...metadata,
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
            layout: {
              pageSize: { width: 1, height: 1 },
              metadata: {
                ...metadata,
                pageNumber: 1,
              },
              contests: [],
            },
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
              ...metadata,
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
            layout: {
              pageSize: { width: 1, height: 1 },
              metadata: {
                ...metadata,
                pageNumber: 2,
              },
              contests: [],
            },
          },
        },
      },
      layouts: {},
      definitions: {},
    })
  );

  const logger = mockBaseLogger();

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock, logger });

  await screen.findByText('Blank Ballot');
  screen.getByText(
    'The last scanned ballot was not tabulated because no marks were detected.'
  );
  screen.getByText(
    'Remove the ballot for manual adjudication or choose to tabulate it anyway.'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'BlankBallot, Undervote',
    })
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));

  apiMock.expectContinueScanning({ forceAccept: true });
  userEvent.click(screen.getByText('Tabulate Ballot'));
});

test('calls out official ballot sheets in test mode', async () => {
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
              ballotStyleId: '1' as BallotStyleId,
              precinctId: '1',
              ballotType: BallotType.Precinct,
              ballotHash: 'abcde',
              isTestMode: false,
              pageNumber: 1,
            },
          },
        },
        back: {
          image: { url: '/back/url' },
          interpretation: {
            type: 'InvalidTestModePage',
            metadata: {
              ballotStyleId: '1' as BallotStyleId,
              precinctId: '1',
              ballotType: BallotType.Precinct,
              ballotHash: 'abcde',
              isTestMode: false,
              pageNumber: 2,
            },
          },
        },
      },
      layouts: {},
      definitions: {},
    })
  );

  const logger = mockBaseLogger();

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock, logger });

  await screen.findByText('Official Ballot');
  screen.getByText(
    'The last scanned ballot was not tabulated because it is an official ballot but the scanner is in test ballot mode.'
  );
  screen.getByText('Remove the ballot before continuing.');
  expect(screen.getByRole('button').textContent).toEqual(
    'Confirm Ballot Removed'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'InvalidTestModePage',
    })
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
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
              ballotStyleId: '1' as BallotStyleId,
              precinctId: '1',
              ballotType: BallotType.Precinct,
              ballotHash: 'abcde',
              isTestMode: false,
              pageNumber: 1,
            },
          },
        },
        back: {
          image: { url: '/back/url' },
          interpretation: {
            type: 'InvalidTestModePage',
            metadata: {
              ballotStyleId: '1' as BallotStyleId,
              precinctId: '1',
              ballotType: BallotType.Precinct,
              ballotHash: 'abcde',
              isTestMode: false,
              pageNumber: 2,
            },
          },
        },
      },
      layouts: {},
      definitions: {},
    })
  );

  const logger = mockBaseLogger();

  renderInAppContext(<BallotEjectScreen isTestMode={false} />, {
    apiMock,
    logger,
  });

  await screen.findByText('Test Ballot');
  screen.getByText(
    'The last scanned ballot was not tabulated because it is a test ballot but the scanner is in official ballot mode.'
  );
  screen.getByText('Remove the ballot before continuing.');
  expect(screen.getByRole('button').textContent).toEqual(
    'Confirm Ballot Removed'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'InvalidTestModePage',
    })
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
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
            type: 'InvalidBallotHashPage',
            actualBallotHash: 'this-is-a-hash-hooray',
            expectedBallotHash: 'something',
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

  const logger = mockBaseLogger();

  renderInAppContext(<BallotEjectScreen isTestMode={false} />, {
    apiMock,
    logger,
  });

  await screen.findByText('Wrong Election');
  screen.getByText('Ballot Election ID');
  screen.getByText('this-is');
  screen.getByText('Scanner Election ID');
  screen.getByText(formatBallotHash(electionGeneralDefinition.ballotHash));

  expect(screen.queryAllByText('Tabulate Ballot').length).toEqual(0);
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'InvalidBallotHashPage, BlankPage',
    })
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});

test('does not allow tabulating the overvote if precinctScanDisallowCastingOvervotes is set', async () => {
  apiMock.apiClient.getSystemSettings.reset();
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    precinctScanDisallowCastingOvervotes: true,
  });
  const metadata: BallotMetadata = {
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '1',
    ballotType: BallotType.Precinct,
    ballotHash: 'abcde',
    isTestMode: false,
  };
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
              ...metadata,
              pageNumber: 1,
            },
            adjudicationInfo: {
              requiresAdjudication: true,
              enabledReasonInfos: [
                {
                  type: AdjudicationReason.Overvote,
                  contestId: '1',
                  optionIds: ['1', '2'],
                  expected: 1,
                },
              ],
              ignoredReasonInfos: [],
              enabledReasons: [AdjudicationReason.Overvote],
            },
            votes: {},
            layout: {
              pageSize: { width: 1, height: 1 },
              metadata: {
                ...metadata,
                pageNumber: 1,
              },
              contests: [],
            },
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
              ...metadata,
              pageNumber: 2,
            },
            adjudicationInfo: {
              requiresAdjudication: false,
              enabledReasonInfos: [],
              ignoredReasonInfos: [],
              enabledReasons: [AdjudicationReason.Overvote],
            },
            votes: {},
            layout: {
              pageSize: { width: 1, height: 1 },
              metadata: {
                ...metadata,
                pageNumber: 2,
              },
              contests: [],
            },
          },
        },
      },
      layouts: {},
      definitions: {},
    })
  );

  const logger = mockBaseLogger();

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock, logger });

  await screen.findByText('Overvote');
  screen.getByText(
    'The last scanned ballot was not tabulated because an overvote was detected.'
  );

  expect(screen.queryByText('Tabulate Ballot')).not.toBeInTheDocument();

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});
