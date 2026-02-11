import { PageInterpretation, SheetOf } from '@votingworks/types';

const BUBBLE_BALLOT_DEFINITIVE_PAGE_TYPES: ReadonlySet<PageInterpretation['type']> =
  new Set([
    'InvalidBallotHashPage',
    'InvalidTestModePage',
    'InvalidPrecinctPage',
  ]);

const BUBBLE_BALLOT_DEFINITIVE_UNREADABLE_REASONS: ReadonlySet<string> = new Set([
  'verticalStreaksDetected',
  'invalidScale',
]);

/**
 * Determines whether the bubble ballot interpretation result is definitive
 * enough to skip summary ballot fallback interpretation. Some bubble ballot
 * errors (wrong election, wrong precinct, scanner streaks) indicate the ballot
 * IS a bubble ballot, so trying summary ballot interpretation would be slow
 * and unnecessary.
 */
export function shouldSkipSummaryBallotInterpretation(
  bubbleBallotInterpretation: SheetOf<PageInterpretation>
): boolean {
  return bubbleBallotInterpretation.some((page) => {
    if (BUBBLE_BALLOT_DEFINITIVE_PAGE_TYPES.has(page.type)) return true;
    if (
      page.type === 'UnreadablePage' &&
      page.reason !== undefined &&
      BUBBLE_BALLOT_DEFINITIVE_UNREADABLE_REASONS.has(page.reason)
    ) {
      return true;
    }
    return false;
  });
}

