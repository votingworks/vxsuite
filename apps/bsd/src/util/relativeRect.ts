import { Rect } from '@votingworks/hmpb-interpreter'

/**
 * Builds a function to convert rect absolute values to relative percentage
 * values based upon size of display rect.
 */
export default function relativeRect(width: number, height: number) {
  return (rect: Rect): Rect => ({
    x: (rect.x / width) * 100,
    y: (rect.y / height) * 100,
    width: (rect.width / width) * 100,
    height: (rect.height / height) * 100,
  })
}
