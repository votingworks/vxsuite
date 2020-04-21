import { BallotPageContestLayout, Rect } from '../types'

/**
 * Finds contest choice areas based on the contest box bounds and the contest
 * option target bounds.
 */
export default function findContestOptions(
  contests: readonly { bounds: Rect; targets: readonly Rect[] }[],
  { topMarginPercent = 3 } = {}
): readonly BallotPageContestLayout[] {
  return contests.map(({ bounds, targets }) =>
    targets.length === 1
      ? {
          bounds,
          options: [{ bounds, target: targets[0] }],
        }
      : {
          bounds,
          options: targets.map((target, i) => {
            const nextTarget = targets[i + 1]
            const height = nextTarget
              ? Math.abs(nextTarget.y - target.y)
              : Math.abs(bounds.y + bounds.height - target.y)
            const topMargin = Math.round((height * topMarginPercent) / 100)

            return {
              bounds: {
                x: bounds.x,
                y: target.y - topMargin,
                width: bounds.width,
                height,
              },
              target,
            }
          }),
        }
  )
}
