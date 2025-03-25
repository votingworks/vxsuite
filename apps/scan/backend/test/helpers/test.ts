import { test } from 'vitest';
import { electricalTest } from './electrical_test';

export type ExtendedTest = typeof test & {
  electrical: typeof electricalTest;
};

const extendedTest: ExtendedTest = ((...args) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (test as any)(...args)) as ExtendedTest;

extendedTest.electrical = electricalTest;

export { extendedTest as test };
