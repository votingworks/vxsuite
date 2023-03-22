import {
  BallotPageContestLayout,
  Corners,
  Rect,
  TargetShape,
} from '@votingworks/types';

/**
 * Finds contest choice areas based on the contest box bounds and the contest
 * option target bounds.
 */
export function findContestOptions(
  contests: ReadonlyArray<{
    contestId: string;
    bounds: Rect;
    corners: Corners;
    targets: readonly TargetShape[];
  }>,
  { topMarginPercent = 3 } = {}
): readonly BallotPageContestLayout[] {
  return contests.map(({ bounds, corners, targets, contestId }) =>
    targets.length === 1
      ? {
          contestId,
          bounds,
          corners,
          options: [{ bounds, target: targets[0] }],
        }
      : {
          contestId,
          bounds,
          corners,
          options: targets.map((target, i) => {
            const nextTarget = targets[i + 1];
            const height = nextTarget
              ? Math.abs(nextTarget.bounds.y - target.bounds.y)
              : Math.abs(bounds.y + bounds.height - target.bounds.y);
            const topMargin = Math.round((height * topMarginPercent) / 100);

            return {
              bounds: {
                x: bounds.x,
                y: target.bounds.y - topMargin,
                width: bounds.width,
                height,
              },
              target,
            };
          }),
        }
  );
}
