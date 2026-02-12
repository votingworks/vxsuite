import { expect, test } from 'vitest';
import {
  BallotStyleId,
  BallotType,
  PageInterpretation,
  SheetOf,
} from '@votingworks/types';
import { shouldSkipSummaryBallotInterpretation } from './should_skip_summary_ballot_interpretation';

const BLANK_PAGE: PageInterpretation = { type: 'BlankPage' };

const UNREADABLE_MISSING_TIMING_MARKS: PageInterpretation = {
  type: 'UnreadablePage',
  reason: 'missingTimingMarks',
};

const UNREADABLE_VERTICAL_STREAKS: PageInterpretation = {
  type: 'UnreadablePage',
  reason: 'verticalStreaksDetected',
};

const UNREADABLE_INVALID_SCALE: PageInterpretation = {
  type: 'UnreadablePage',
  reason: 'invalidScale',
};

const UNREADABLE_BORDER_INSET: PageInterpretation = {
  type: 'UnreadablePage',
  reason: 'borderInsetNotFound',
};

const UNREADABLE_UNEXPECTED_DIMENSIONS: PageInterpretation = {
  type: 'UnreadablePage',
  reason: 'unexpectedDimensions',
};

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

test('returns true for UnreadablePage with verticalStreaksDetected', () => {
  const sheet: SheetOf<PageInterpretation> = [
    UNREADABLE_VERTICAL_STREAKS,
    BLANK_PAGE,
  ];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(true);
});

test('returns true for UnreadablePage with invalidScale', () => {
  const sheet: SheetOf<PageInterpretation> = [
    UNREADABLE_INVALID_SCALE,
    BLANK_PAGE,
  ];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(true);
});

test('returns true when only one page has a definitive error', () => {
  const sheet: SheetOf<PageInterpretation> = [
    UNREADABLE_MISSING_TIMING_MARKS,
    INVALID_BALLOT_HASH,
  ];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(true);
});

test('returns false for BlankPage on both sides', () => {
  const sheet: SheetOf<PageInterpretation> = [BLANK_PAGE, BLANK_PAGE];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(false);
});

test('returns false for UnreadablePage with missingTimingMarks', () => {
  const sheet: SheetOf<PageInterpretation> = [
    UNREADABLE_MISSING_TIMING_MARKS,
    BLANK_PAGE,
  ];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(false);
});

test('returns false for UnreadablePage with borderInsetNotFound', () => {
  const sheet: SheetOf<PageInterpretation> = [
    UNREADABLE_BORDER_INSET,
    BLANK_PAGE,
  ];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(false);
});

test('returns false for UnreadablePage with unexpectedDimensions', () => {
  const sheet: SheetOf<PageInterpretation> = [
    UNREADABLE_UNEXPECTED_DIMENSIONS,
    BLANK_PAGE,
  ];
  expect(shouldSkipSummaryBallotInterpretation(sheet)).toEqual(false);
});
