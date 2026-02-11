import { PageInterpretation, SheetOf } from '@votingworks/types';

const BUBBLE_BALLOT_DEFINITIVE_PAGE_TYPES: ReadonlySet<PageInterpretation['type']> =
  new Set([
    'InvalidBallotHashPage',
    'InvalidTestModePage',
    'InvalidPrecinctPage',
  ]);

/**
 * Determines whether the bubble ballot interpretation result is definitive
 * enough to skip summary ballot fallback interpretation.
 *
 * This handles the TypeScript-validation cases: when the QR code decoded
 * successfully (confirming a bubble ballot) but the scanner configuration
 * rejected it (wrong election hash, test mode, or precinct). The Rust-side
 * `isBubbleBallot` flag covers the complementary cases (e.g. QR decode
 * failures, streak/scale detection) and is checked separately in
 * `interpretSheet` before this function is called.
 */
export function shouldSkipSummaryBallotInterpretation(
  bubbleBallotInterpretation: SheetOf<PageInterpretation>
): boolean {
  return bubbleBallotInterpretation.some((page) =>
    BUBBLE_BALLOT_DEFINITIVE_PAGE_TYPES.has(page.type)
  );
}
