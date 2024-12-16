import { expect, test } from 'vitest';
import { MaybePromise } from '@votingworks/basics';

export function run<I, T extends (input: I) => MaybePromise<unknown>>({
  name = 'example',
  makeInput,
  referenceImplementation,
  exerciseImplementation,
  solutionImplementation,
}: {
  name?: string;
  makeInput: () => MaybePromise<I>;
  referenceImplementation: T;
  exerciseImplementation: T;
  solutionImplementation: T;
}): void {
  test(name, async () => {
    const referenceResult = await referenceImplementation(await makeInput());
    const solutionResult = await solutionImplementation(await makeInput());
    expect(referenceResult).toEqual(solutionResult);

    if (process.env['CI']) {
      return;
    }

    const exerciseResult = await exerciseImplementation(await makeInput());
    expect(referenceResult).toEqual(exerciseResult);
  });
}
