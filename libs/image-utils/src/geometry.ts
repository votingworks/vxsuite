import { isCloseToZero } from './numeric';
import { float } from './types';

/**
 * Normalizes an angle to the range [0, π), where 0 and π represent the same
 * angle.
 */
export function normalizeHalfAngle(angle: float): float {
  const normalized = angle % Math.PI;
  return isCloseToZero(normalized) ||
    isCloseToZero(normalized - Math.PI) ||
    isCloseToZero(normalized + Math.PI)
    ? 0
    : normalized + (normalized < 0 ? Math.PI : 0);
}

/**
 * Determines whether two angles are approximately colinear, i.e. whether they
 * are nearly parallel.
 */
export function checkApproximatelyColinear(
  angle1: float,
  angle2: float,
  tolerance: float
): boolean {
  const angleDiff = normalizeHalfAngle(
    normalizeHalfAngle(angle1) - normalizeHalfAngle(angle2)
  );
  return angleDiff <= tolerance || angleDiff >= Math.PI - tolerance;
}
