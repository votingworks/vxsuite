// duplicated from shared utils library in order to avoid creating a cyclical dependency
export function throwIllegalValue(s: never): never {
  throw new Error(`Illegal Value: ${s}`);
}

/**
 * Generate all combinations of an array.
 * @param sourceArray - Array of input elements.
 * @param comboLength - Desired length of combinations.
 * @returns Array of combination arrays.
 */
export function generateCombinations<T>(
  sourceArray: readonly T[],
  comboLength: number
): Array<T[]> {
  const sourceLength = sourceArray.length;
  if (comboLength > sourceLength) return [];

  const combos: Array<T[]> = []; // Stores valid combinations as they are generated.

  // Accepts a partial combination, an index into sourceArray,
  // and the number of elements required to be added to create a full-length combination.
  // Called recursively to build combinations, adding subsequent elements at each call depth.
  function makeNextCombos(
    workingCombo: T[],
    currentIndex: number,
    remainingCount: number
  ) {
    const oneAwayFromComboLength = remainingCount === 1;

    // For each element that remains to be added to the working combination.
    for (
      let sourceIndex = currentIndex;
      sourceIndex < sourceLength;
      sourceIndex += 1
    ) {
      // Get next (possibly partial) combination.
      const next = [...workingCombo, sourceArray[sourceIndex]];

      if (oneAwayFromComboLength) {
        // Combo of right length found, save it.
        combos.push(next);
      } else {
        // Otherwise go deeper to add more elements to the current partial combination.
        makeNextCombos(next, sourceIndex + 1, remainingCount - 1);
      }
    }
  }
  makeNextCombos([], 0, comboLength);
  return combos;
}
