import type { CvrContestTag } from '@votingworks/admin-backend';
import {
  BallotPageContestOptionLayout,
  ContestOptionId,
  Rect,
} from '@votingworks/types';

export function normalizeWriteInName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/, ' ');
}

export function getOptionCoordinates(
  optionsLayout: readonly BallotPageContestOptionLayout[],
  optionId: ContestOptionId
): Rect {
  const option = optionsLayout.find((opt) => opt.definition?.id === optionId);
  /* istanbul ignore next - @preserve */
  if (!option) {
    throw new Error(
      'unable to find option in layout when determining option ballot coordinates'
    );
  }
  return option.bounds;
}

export function isContestTagOnlyUndervote(tag: CvrContestTag): boolean {
  return (
    (tag.hasUndervote &&
      !tag.hasMarginalMark &&
      !tag.hasWriteIn &&
      !tag.hasUnmarkedWriteIn &&
      !tag.hasOvervote) ??
    false
  );
}
