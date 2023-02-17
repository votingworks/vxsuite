/* eslint-disable no-param-reassign */
import { assert } from 'console';

function range(start: number, end: number): number[] {
  const result = [];
  for (let i = start; i < end; i++) {
    result.push(i);
  }
  return result;
}

function argMax(
  indexes: number[],
  valFunction: (index: number) => number
): number {
  let maxIndex = indexes[0];
  let maxValue = valFunction(maxIndex);
  for (let i = 1; i < indexes.length; i += 1) {
    const index = indexes[i];
    const value = valFunction(index);
    if (value > maxValue) {
      maxIndex = index;
      maxValue = value;
    }
  }
  return maxIndex;
}

type Vector = number[];
type Matrix = Vector[];

/**
 * Solves a linear system of equations. The system is represented by an
 * augmented matrix containing the coefficients of the system from the LHS and
 * the constants from the RHS.
 *
 * E.g. for the system:
 *
 *  x + y = 5
 *  2x - y = 1
 *
 * The augmented matrix would be:
 *
 *  [
 *    [1, 1, 5]
 *    [2, -1, 1]
 *  ]
 *
 * Returns an array of solutions. If the system is inconsistent, returns undefined.
 *
 * Uses Gaussian elimination with partial pivoting as described here: https://en.wikipedia.org/wiki/Gaussian_elimination#Pseudocode
 */
export function solveLinearSystem(augmentedMatrix: Matrix): Vector | undefined {
  if (augmentedMatrix.length === 0) {
    return [];
  }

  function forwardEliminate(A: Matrix): Matrix {
    // Make a copy of the matrix so we don't mutate the original
    A = A.map((row) => [...row]);
    const m = A.length;
    const n = A[0].length;

    let h = 0; // Pivot row index
    let k = 0; // Pivot column index

    while (h < m && k < n) {
      // Find the kth pivot
      // eslint-disable-next-line no-loop-func
      const iMax = argMax(range(h, m), (i) => Math.abs(A[i][k]));

      // If there is no pivot in this column, the column is all zeros, so move to the next column
      if (A[iMax][k] === 0) {
        k += 1;
        continue;
      }

      // Swap the pivot row with the current row
      const pivotRow = A[iMax];
      A[iMax] = A[h];
      A[h] = pivotRow;

      // For all rows below the pivot row, perform row reduction
      for (let i = h + 1; i < m; i += 1) {
        const f = A[i][k] / A[h][k];
        for (let j = k + 1; j < n; j += 1) {
          A[i][j] -= A[h][j] * f;
        }
        // Fill lower triangular matrix with zeros
        A[i][k] = 0;
      }

      // Increase the pivot row and column
      h += 1;
      k += 1;
    }

    // Filter out redundant rows
    return A.filter((row) => row.some((x) => x !== 0));
  }

  function checkConsistency(A: Matrix): boolean {
    // If last row of coefficients is all zeros but the solution is non-zero,
    // the system is inconsistent
    const lastRow = A[A.length - 1];
    const coefficients = lastRow.slice(0, -1);
    const solution = lastRow[lastRow.length - 1];
    return !coefficients.every((x) => x === 0) && solution !== 0;
  }

  function backSubstitute(A: Matrix): Vector {
    const m = A.length;
    const n = A[0].length;

    const x = range(0, m).map(() => 0);
    for (let i = m - 1; i >= 0; i -= 1) {
      x[i] = A[i][n - 1] / A[i][i];
      for (let k = i - 1; k >= 0; k -= 1) {
        A[k][n - 1] -= A[k][i] * x[i];
      }
    }
    return x;
  }

  const upperTriangularMatrix = forwardEliminate(augmentedMatrix);
  const isConsistent = checkConsistency(upperTriangularMatrix);
  if (!isConsistent) return undefined;
  const solutions = backSubstitute(upperTriangularMatrix);
  // Deal with floating point precision errors
  const roundedSolutions = solutions.map(
    (solution) => Math.round(solution * 100) / 100
  );
  return roundedSolutions;
}
