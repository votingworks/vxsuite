import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { solveLinearSystem } from './linear_system';

test('solveLinearSystem', () => {
  // Basic cases
  expect(solveLinearSystem([])).toEqual([]);

  expect(
    solveLinearSystem([
      [1, 0, 1],
      [0, 1, 1],
    ])
  ).toEqual([1, 1]);

  expect(
    solveLinearSystem([
      [0, 1, 1],
      [1, 1, 1],
    ])
  ).toEqual([0, 1]);

  expect(
    solveLinearSystem([
      [1, 0, 2],
      [0, 1, 3],
    ])
  ).toEqual([2, 3]);

  expect(
    solveLinearSystem([
      [1, 1, 2],
      [0, 1, 1],
    ])
  ).toEqual([1, 1]);

  expect(
    solveLinearSystem([
      [1, 1, 0, 2],
      [1, 0, 1, 2],
      [0, 1, 1, 2],
    ])
  ).toEqual([1, 1, 1]);

  // Handcrafted systems
  expect(
    solveLinearSystem([
      [1, 1, 0, 15],
      [1, 0, 1, 11],
      [0, 1, 1, 6],
    ])
  ).toEqual([10, 5, 1]);

  expect(
    solveLinearSystem([
      [1, 0, 1, 1, 26],
      [1, 0, 0, 1, 21],
      [1, 1, 0, 0, 30],
      [0, 1, 0, 0, 10],
      [0, 1, 0, 0, 10],
      [0, 0, 1, 0, 5],
    ])
  ).toEqual([20, 10, 5, 1]);

  // Example from external_tallies.test.ts
  expect(
    solveLinearSystem([
      [1, 1, 0, 0, 0, 0, 19],
      [0, 0, 1, 0, 0, 0, 32],
      [0, 0, 0, 1, 1, 1, 64],
      [1, 0, 0, 0, 0, 0, 7],
      [0, 0, 1, 0, 0, 0, 32],
      [0, 0, 0, 0, 1, 1, 39],
      [1, 0, 0, 0, 0, 0, 7],
      [0, 1, 0, 0, 0, 0, 12],
      [0, 0, 1, 0, 0, 0, 32],
      [0, 0, 0, 0, 0, 1, 21],
      [0, 1, 0, 0, 0, 0, 12],
      [0, 0, 1, 0, 0, 0, 32],
      [0, 0, 0, 0, 0, 1, 21],
    ])
  ).toEqual([7, 12, 32, 25, 18, 21]);

  // Example from https://www.cliffsnotes.com/study-guides/algebra/linear-algebra/linear-systems/gaussian-elimination
  expect(
    solveLinearSystem([
      [1, 1, 3],
      [3, -2, 4],
    ])
  ).toEqual([2, 1]);

  // Example from https://mathworld.wolfram.com/GaussianElimination.html
  expect(
    solveLinearSystem([
      [9, 3, 4, 7],
      [4, 3, 4, 8],
      [1, 1, 1, 3],
    ])
  ).toEqual([-1 / 5, 4, -4 / 5]);

  // Systems with no solution
  expect(
    solveLinearSystem([
      [1, 1, 2],
      [1, 1, 3],
    ])
  ).toBeUndefined();

  // Example from https://byjus.com/jee/system-of-linear-equations-has-no-solution/
  expect(
    solveLinearSystem([
      [-4, 10, 6],
      [2, -5, 3],
    ])
  ).toBeUndefined();

  // Example from a broken tallies test case
  expect(
    solveLinearSystem([
      [1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 4],
      [1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 5],
      [1, 1, 1, 1, 1, 0],
      [1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0],
      [0, 0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 1, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0],
    ])
  ).toBeUndefined();
});
