import { expect, test } from 'vitest';
import {
  BallotStyleId,
  BallotType,
  PageInterpretation,
  SheetOf,
} from '@votingworks/types';
import { shouldSkipSummaryBallotInterpretation } from './should_skip_summary_ballot_interpretation';

const BLANK_PAGE: PageInterpretation = { type: 'BlankPage' };

const INVALID_BALLOT_HASH: PageInterpretation = {
  type: 'InvalidBallotHashPage',
  expectedBallotHash: 'abc123',
  actualBallotHash: 'def456',
};

const INVALID_TEST_MODE: PageInterpretation = {
  type: 'InvalidTestModePage',
  metadata: {
    ballotHash: 'abc123',
    ballotType: BallotType.Precinct,
    ballotStyleId: '1' as BallotStyleId,
    precinctId: 'precinct-1',
    isTestMode: true,
  },
};

const INVALID_PRECINCT: PageInterpretation = {
  type: 'InvalidPrecinctPage',
  metadata: {
    ballotHash: 'abc123',
    ballotType: BallotType.Precinct,
    ballotStyleId: '1' as BallotStyleId,
    precinctId: 'precinct-1',
    isTestMode: false,
  },
};

test('returns true for InvalidBallotHashPage', () => {
  const sheet: SheetOf<PageInterpretation> = [INVALID_BALLOT_HASH, BLANK_PAGE];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(true);
});

test('returns true for InvalidTestModePage', () => {
  const sheet: SheetOf<PageInterpretation> = [INVALID_TEST_MODE, BLANK_PAGE];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(true);
});

test('returns true for InvalidPrecinctPage', () => {
  const sheet: SheetOf<PageInterpretation> = [INVALID_PRECINCT, BLANK_PAGE];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(true);
});

test('returns true when only one page has a definitive error', () => {
  const sheet: SheetOf<PageInterpretation> = [
    { type: 'UnreadablePage', reason: 'missingTimingMarks' },
    INVALID_BALLOT_HASH,
  ];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(true);
});

test('returns false for BlankPage on both sides', () => {
  const sheet: SheetOf<PageInterpretation> = [BLANK_PAGE, BLANK_PAGE];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(false);
});

test('returns false for UnreadablePage (Rust-side bubble ballot detection handled separately)', () => {
  const sheet: SheetOf<PageInterpretation> = [
    { type: 'UnreadablePage', reason: 'missingTimingMarks' },
    BLANK_PAGE,
  ];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(false);
});
