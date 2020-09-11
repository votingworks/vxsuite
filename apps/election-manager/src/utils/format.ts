/* eslint-disable import/prefer-default-export */

const countFormatter = new Intl.NumberFormat(undefined, { useGrouping: true })

/**
 * Format integers for display as whole numbers, i.e. a count of something.
 */
export function count(value: number): string {
  return countFormatter.format(value)
}
