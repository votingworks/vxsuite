import { afterEach, beforeEach, expect, test } from 'vitest';
import {
  AdjudicationReason,
  BallotPageMetadata,
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  formatBallotHash,
  SheetInterpretation,
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
  sheetInterpretation: SheetInterpretation
): NextReviewSheet {
  function buildImage(pageNumber: number) {
    return {
      imageUrl: 'data:image/png;base64,',
      ballotBounds: { x: 0, y: 0, width: 1700, height: 2200 },
      layout: {
        contests: [],
        metadata: buildHmpMetadataWithPage(pageNumber),
        pageSize: { width: 1, height: 1 },
      },
    };
  }
  return {
    sheetInterpretation,
    images: [buildImage(1), buildImage(2)] as const,
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
      type: 'InvalidSheet',
      reason: { type: 'unknown' },
    })
  );

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock });

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

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});

test('says the ballot sheet is overvoted if it is', async () => {
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      type: 'NeedsReviewSheet',
      reasons: [
        {
          type: AdjudicationReason.Overvote,
          contestId: '1',
          optionIds: ['1', '2'],
          expected: 1,
        },
      ],
    })
  );

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock });

  await screen.findByText('Overvote');
  screen.getByText(
    'The last scanned ballot was not tabulated because an overvote was detected.'
  );
  screen.getByText(
    'Remove the ballot for manual adjudication or choose to tabulate it anyway.'
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
    sheetInterpretation: {
      type: 'NeedsReviewSheet',
      reasons: [
        {
          type: AdjudicationReason.Overvote,
          contestId: 'contest-1',
          optionIds: ['1', '2'],
          expected: 1,
        },
      ],
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

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock });

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
      type: 'NeedsReviewSheet',
      reasons: [
        {
          type: AdjudicationReason.Undervote,
          contestId: '1',
          optionIds: [],
          expected: 1,
        },
      ],
    })
  );

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock });

  await screen.findByText('Undervote');
  screen.getByText(
    'The last scanned ballot was not tabulated because an undervote was detected.'
  );
  screen.getByText(
    'Remove the ballot for manual adjudication or choose to tabulate it anyway.'
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));

  apiMock.expectContinueScanning({ forceAccept: true });
  userEvent.click(screen.getByText('Tabulate Ballot'));
});

test('says the ballot sheet is blank if it is', async () => {
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      type: 'NeedsReviewSheet',
      reasons: [
        {
          type: AdjudicationReason.Undervote,
          contestId: '1',
          expected: 1,
          optionIds: [],
        },
        { type: AdjudicationReason.BlankBallot },
      ],
    })
  );

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock });

  await screen.findByText('Blank Ballot');
  screen.getByText(
    'The last scanned ballot was not tabulated because no marks were detected.'
  );
  screen.getByText(
    'Remove the ballot for manual adjudication or choose to tabulate it anyway.'
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));

  apiMock.expectContinueScanning({ forceAccept: true });
  userEvent.click(screen.getByText('Tabulate Ballot'));
});

test('calls out official ballot sheets in test mode', async () => {
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      type: 'InvalidSheet',
      reason: { type: 'invalid_test_mode' },
    })
  );

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock });

  await screen.findByText('Official Ballot');
  screen.getByText(
    'The last scanned ballot was not tabulated because it is an official ballot but the scanner is in test ballot mode.'
  );
  screen.getByText('Remove the ballot before continuing.');
  expect(screen.getByRole('button').textContent).toEqual(
    'Confirm Ballot Removed'
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});

test('calls out test ballot sheets in live mode', async () => {
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      type: 'InvalidSheet',
      reason: { type: 'invalid_test_mode' },
    })
  );

  renderInAppContext(<BallotEjectScreen isTestMode={false} />, { apiMock });

  await screen.findByText('Test Ballot');
  screen.getByText(
    'The last scanned ballot was not tabulated because it is a test ballot but the scanner is in official ballot mode.'
  );
  screen.getByText('Remove the ballot before continuing.');
  expect(screen.getByRole('button').textContent).toEqual(
    'Confirm Ballot Removed'
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});

test('shows invalid election screen when appropriate', async () => {
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      type: 'InvalidSheet',
      reason: {
        type: 'invalid_ballot_hash',
        actualBallotHash: 'this-is-a-hash-hooray',
      },
    })
  );

  renderInAppContext(<BallotEjectScreen isTestMode={false} />, { apiMock });

  await screen.findByText('Wrong Election');
  screen.getByText('Ballot Election ID');
  screen.getByText('this-is');
  screen.getByText('Scanner Election ID');
  screen.getByText(
    formatBallotHash(readElectionGeneralDefinition().ballotHash)
  );

  expect(screen.queryAllByText('Tabulate Ballot').length).toEqual(0);

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});

test('does not allow tabulating the overvote if disallowCastingOvervotes is set', async () => {
  apiMock.apiClient.getSystemSettings.reset();

  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    disallowCastingOvervotes: true,
  });
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      type: 'NeedsReviewSheet',
      reasons: [
        {
          type: AdjudicationReason.Overvote,
          contestId: '1',
          optionIds: ['1', '2'],
          expected: 1,
        },
      ],
    })
  );

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock });

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
      type: 'InvalidSheet',
      reason: { type: 'vertical_streaks_detected' },
    })
  );

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock });

  await screen.findByText('Streak Detected');
  screen.getByText(
    'The last scanned ballot was not tabulated because the scanner needs to be cleaned.'
  );
  screen.getByText('Clean the scanner before continuing to scan ballots.');
  expect(screen.getByRole('button').textContent).toEqual(
    'Confirm Ballot Removed'
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});

test('falls through to "Unreadable" for an UnreadablePage with an unrecognized reason', async () => {
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      type: 'InvalidSheet',
      reason: { type: 'unreadable' },
    })
  );

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock });

  await screen.findByText('Unreadable');
  screen.getByText(
    'The last scanned ballot was not tabulated because there was a problem reading the ballot.'
  );
  expect(screen.getByRole('button').textContent).toEqual(
    'Confirm Ballot Removed'
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});

test('ballot with invalid scale', async () => {
  apiMock.expectGetNextReviewSheet(
    buildNextReviewSheet({
      type: 'InvalidSheet',
      reason: { type: 'invalid_scale' },
    })
  );

  renderInAppContext(<BallotEjectScreen isTestMode />, { apiMock });

  await screen.findByText('Invalid Scale');
  screen.getByText('The last scanned ballot was printed at an invalid scale.');
  screen.getByText('Ballots must be printed full-scale.');
  expect(screen.getByRole('button').textContent).toEqual(
    'Confirm Ballot Removed'
  );

  apiMock.expectContinueScanning({ forceAccept: false });
  userEvent.click(screen.getByText('Confirm Ballot Removed'));
});
