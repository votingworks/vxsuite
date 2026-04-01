import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mockBaseLogger, LogEventId } from '@votingworks/logging';
import {
  AdjudicationReason,
  BallotMetadata,
  BallotPageMetadata,
  BallotSheetInfo,
  BallotStyleId,
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  formatBallotHash,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { HIGHLIGHT_WARNING_BACKGROUND } from '@votingworks/ui';
import { screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { BallotEjectScreen } from './ballot_eject_screen';
import { createApiMock, ApiMock } from '../../test/api';

let apiMock: ApiMock;

type NextReviewSheet = Awaited<
  ReturnType<(typeof apiMock.apiClient)['getNextReviewSheet']>
>;

function buildBmdMetadata(): BallotMetadata {
  return {
    ballotStyleId: '1',
    precinctId: '1',
    ballotType: BallotType.Precinct,
    ballotHash: 'abcde',
    isTestMode: false,
  };
}

function buildHmpMetadataWithPage(pageNumber: number): BallotPageMetadata {
  return {
    ballotStyleId: '1',
    precinctId: '1',
    ballotType: BallotType.Precinct,
    ballotHash: 'abcde',
    isTestMode: false,
    pageNumber,
  };
}

function buildNextReviewSheet(
  ballotSheetInfo: BallotSheetInfo
): NextReviewSheet {
  const frontMetadata: BallotMetadata | BallotPageMetadata =
    'metadata' in ballotSheetInfo.front.interpretation
      ? ballotSheetInfo.front.interpretation.metadata
      : buildHmpMetadataWithPage(1);
  const backMetadata: BallotMetadata | BallotPageMetadata =
    'metadata' in ballotSheetInfo.back.interpretation
      ? ballotSheetInfo.back.interpretation.metadata
      : buildHmpMetadataWithPage(2);
  function buildImage(metadata: BallotMetadata | BallotPageMetadata) {
    return {
      imageUrl: 'data:image/png;base64,',
      ballotBounds: { x: 0, y: 0, width: 1700, height: 2200 },
      layout:
        'pageNumber' in metadata
          ? {
              contests: [],
              metadata,
              pageSize: { width: 1, height: 1 },
            }
          : undefined,
    };
  }
  return {
    interpreted: ballotSheetInfo,
    images: [buildImage(frontMetadata), buildImage(backMetadata)] as const,
  };
}

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('says the sheet is unreadable if it is', async () => {
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      id: 'mock-sheet-id',
      front: {
        interpretation: { type: 'BlankPage' },
      },
      back: {
        interpretation: { type: 'BlankPage' },
      },
    })
  );

  const logger = mockBaseLogger({ fn: vi.fn });

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
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      id: 'mock-sheet-id',
      front: {
        interpretation: {
          type: 'InterpretedHmpbPage',
          markInfo: {
            ballotSize: { width: 1, height: 1 },
            marks: [],
          },
          metadata: buildHmpMetadataWithPage(1),
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
            metadata: buildHmpMetadataWithPage(1),
            contests: [],
          },
        },
      },
      back: {
        interpretation: {
          type: 'InterpretedHmpbPage',
          markInfo: {
            ballotSize: { width: 1, height: 1 },
            marks: [],
          },
          metadata: buildHmpMetadataWithPage(2),
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
            enabledReasons: [AdjudicationReason.Overvote],
          },
          votes: {},
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: buildHmpMetadataWithPage(2),
            contests: [],
          },
        },
      },
    })
  );

  const logger = mockBaseLogger({ fn: vi.fn });

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

test('renders both ballot images with highlights on overvoted contests', async () => {
  const BALLOT_BOUNDS = { x: 0, y: 0, width: 1700, height: 2200 } as const;
  const CONTEST_BOUNDS = { x: 100, y: 200, width: 500, height: 300 } as const;

  apiMock.expectGetNextReviewSheet({
    interpreted: {
      id: 'mock-sheet-id',
      front: {
        interpretation: {
          type: 'InterpretedHmpbPage',
          markInfo: { ballotSize: { width: 1, height: 1 }, marks: [] },
          metadata: buildHmpMetadataWithPage(1),
          adjudicationInfo: {
            requiresAdjudication: true,
            enabledReasonInfos: [
              {
                type: AdjudicationReason.Overvote,
                contestId: 'contest-1',
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
            metadata: buildHmpMetadataWithPage(1),
            contests: [],
          },
        },
      },
      back: {
        interpretation: {
          type: 'InterpretedHmpbPage',
          markInfo: { ballotSize: { width: 1, height: 1 }, marks: [] },
          metadata: buildHmpMetadataWithPage(2),
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
            enabledReasons: [AdjudicationReason.Overvote],
          },
          votes: {},
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: buildHmpMetadataWithPage(2),
            contests: [],
          },
        },
      },
    },
    images: [
      {
        imageUrl: 'mock-front-image',
        ballotBounds: BALLOT_BOUNDS,
        layout: {
          pageSize: { width: 1700, height: 2200 },
          metadata: buildHmpMetadataWithPage(1),
          contests: [
            {
              contestId: 'contest-1',
              bounds: CONTEST_BOUNDS,
              corners: [
                { x: 100, y: 200 },
                { x: 600, y: 200 },
                { x: 100, y: 500 },
                { x: 600, y: 500 },
              ],
              options: [],
            },
            {
              contestId: 'contest-2',
              bounds: { x: 100, y: 600, width: 500, height: 300 },
              corners: [
                { x: 100, y: 600 },
                { x: 600, y: 600 },
                { x: 100, y: 900 },
                { x: 600, y: 900 },
              ],
              options: [],
            },
          ],
        },
      },
      {
        imageUrl: 'mock-back-image',
        ballotBounds: BALLOT_BOUNDS,
        layout: {
          pageSize: { width: 1700, height: 2200 },
          metadata: buildHmpMetadataWithPage(2),
          contests: [],
        },
      },
    ] as const,
  });

  const logger = mockBaseLogger({ fn: vi.fn });

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock, logger });

  await screen.findByText('Overvote');

  // Both ballot images are rendered
  const ballotImages = screen.getAllByRole('img', { name: /ballot/i });
  expect(ballotImages).toHaveLength(2);
  expect(ballotImages[0].style.backgroundImage).toContain('mock-front-image');
  expect(ballotImages[1].style.backgroundImage).toContain('mock-back-image');

  // Front image has a single highlight overlay for the overvoted contest only
  const frontHighlights = ballotImages[0].querySelectorAll('div');
  expect(frontHighlights).toHaveLength(1);
  expect(frontHighlights[0]).toHaveStyle({
    background: HIGHLIGHT_WARNING_BACKGROUND,
  });

  // Back image has no highlights
  expect(ballotImages[1].querySelector('div')).not.toBeInTheDocument();

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});

test('says the ballot sheet is undervoted if it is', async () => {
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      id: 'mock-sheet-id',
      front: {
        interpretation: {
          type: 'InterpretedHmpbPage',
          markInfo: {
            ballotSize: { width: 1, height: 1 },
            marks: [],
          },
          metadata: buildHmpMetadataWithPage(1),
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
            metadata: buildHmpMetadataWithPage(1),
            contests: [],
          },
        },
      },
      back: {
        interpretation: {
          type: 'InterpretedHmpbPage',
          markInfo: {
            ballotSize: { width: 1, height: 1 },
            marks: [],
          },
          metadata: buildHmpMetadataWithPage(2),
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
            enabledReasons: [AdjudicationReason.Overvote],
          },
          votes: {},
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: buildHmpMetadataWithPage(2),
            contests: [],
          },
        },
      },
    })
  );

  const logger = mockBaseLogger({ fn: vi.fn });

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
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      id: 'mock-sheet-id',
      front: {
        interpretation: {
          type: 'InterpretedHmpbPage',
          markInfo: {
            ballotSize: { width: 1, height: 1 },
            marks: [],
          },
          metadata: buildHmpMetadataWithPage(1),
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
            metadata: buildHmpMetadataWithPage(1),
            contests: [],
          },
        },
      },
      back: {
        interpretation: {
          type: 'InterpretedHmpbPage',
          markInfo: {
            ballotSize: { width: 1, height: 1 },
            marks: [],
          },
          metadata: buildHmpMetadataWithPage(2),
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
            metadata: buildHmpMetadataWithPage(2),
            contests: [],
          },
        },
      },
    })
  );

  const logger = mockBaseLogger({ fn: vi.fn });

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
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      id: 'mock-sheet-id',
      front: {
        interpretation: {
          type: 'InvalidTestModePage',
          metadata: {
            ...buildBmdMetadata(),
            isTestMode: false,
          },
        },
      },
      back: {
        interpretation: {
          type: 'InvalidTestModePage',
          metadata: {
            ...buildBmdMetadata(),
            isTestMode: false,
          },
        },
      },
    })
  );

  const logger = mockBaseLogger({ fn: vi.fn });

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
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      id: 'mock-sheet-id',
      front: {
        interpretation: {
          type: 'InvalidTestModePage',
          metadata: {
            ...buildBmdMetadata(),
            isTestMode: true,
          },
        },
      },
      back: {
        interpretation: {
          type: 'InvalidTestModePage',
          metadata: {
            ...buildBmdMetadata(),
            isTestMode: true,
          },
        },
      },
    })
  );

  const logger = mockBaseLogger({ fn: vi.fn });

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
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      id: 'mock-sheet-id',
      front: {
        interpretation: {
          type: 'InvalidBallotHashPage',
          actualBallotHash: 'this-is-a-hash-hooray',
          expectedBallotHash: 'something',
        },
      },
      back: {
        interpretation: { type: 'BlankPage' },
      },
    })
  );

  const logger = mockBaseLogger({ fn: vi.fn });

  renderInAppContext(<BallotEjectScreen isTestMode={false} />, {
    apiMock,
    logger,
  });

  await screen.findByText('Wrong Election');
  screen.getByText('Ballot Election ID');
  screen.getByText('this-is');
  screen.getByText('Scanner Election ID');
  screen.getByText(
    formatBallotHash(readElectionGeneralDefinition().ballotHash)
  );

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

test('does not allow tabulating the overvote if disallowCastingOvervotes is set', async () => {
  apiMock.apiClient.getSystemSettings.reset();

  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    disallowCastingOvervotes: true,
  });
  const metadata: BallotMetadata = {
    ballotStyleId: '1' as BallotStyleId,
    precinctId: '1',
    ballotType: BallotType.Precinct,
    ballotHash: 'abcde',
    isTestMode: false,
  };
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      id: 'mock-sheet-id',
      front: {
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
    })
  );

  const logger = mockBaseLogger({ fn: vi.fn });

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock, logger });

  await screen.findByText('Overvote');
  screen.getByText(
    'The last scanned ballot was not tabulated because an overvote was detected.'
  );

  expect(screen.queryByText('Tabulate Ballot')).not.toBeInTheDocument();

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});

test('says the scanner needs cleaning if a streak is detected', async () => {
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      id: 'mock-sheet-id',
      front: {
        interpretation: {
          type: 'UnreadablePage',
          reason: 'verticalStreaksDetected',
        },
      },
      back: {
        interpretation: {
          type: 'UnreadablePage',
          reason: 'verticalStreaksDetected',
        },
      },
    })
  );

  const logger = mockBaseLogger({ fn: vi.fn });

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock, logger });

  await screen.findByText('Streak Detected');
  screen.getByText(
    'The last scanned ballot was not tabulated because the scanner needs to be cleaned.'
  );
  screen.getByText('Clean the scanner before continuing to scan ballots.');
  expect(screen.getByRole('button').textContent).toEqual(
    'Confirm Ballot Removed'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'UnreadablePage',
    })
  );
  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});

test('ballot with invalid scale', async () => {
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      id: 'mock-sheet-id',
      front: {
        interpretation: {
          type: 'UnreadablePage',
          reason: 'invalidScale',
        },
      },
      back: {
        interpretation: {
          type: 'UnreadablePage',
          reason: 'invalidScale',
        },
      },
    })
  );

  const logger = mockBaseLogger({ fn: vi.fn });

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock, logger });

  await screen.findByText('Invalid Scale');
  screen.getByText('The last scanned ballot was printed at an invalid scale.');
  screen.getByText('Ballots must be printed full-scale.');
  expect(screen.getByRole('button').textContent).toEqual(
    'Confirm Ballot Removed'
  );

  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'election_manager',
    expect.objectContaining({
      adjudicationTypes: 'UnreadablePage',
    })
  );
  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});
