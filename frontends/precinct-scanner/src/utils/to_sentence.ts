import { assert } from "@votingworks/utils";
import React from 'react';

/**
 * Joins elements of `list` along with `comma` and `and` into parts that, when
 * displayed together, form a sentence.
 */
export function toSentence(
  list: Iterable<React.ReactChild>,
  comma = ', ',
  and = ' and '
): React.ReactChild[] {
  const elements = [...list];

  if (elements.length < 2) {
    return elements;
  }

  if (elements.length === 2) {
    return [elements[0], and, elements[1]];
  }

  const head = elements;
  const tail = head.pop();
  assert(typeof tail !== 'undefined');
  return [...head.flatMap((element) => [element, comma]), and, tail];
}
