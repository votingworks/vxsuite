import React from 'react'

/**
 * Joins elements of `list` along with `comma` and `and` into parts that, when
 * displayed together, form a sentence.
 */
export function toSentence(
  list: Iterable<React.ReactChild>,
  comma = ', ',
  and = ' and '
): React.ReactChild[] {
  const elements = [...list]

  if (elements.length < 2) {
    return elements
  }

  return [
    ...elements.slice(0, -1).flatMap((element) => [element, comma]),
    and,
    elements[elements.length - 1],
  ]
}
