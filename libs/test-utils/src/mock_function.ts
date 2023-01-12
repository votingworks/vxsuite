import { inspect } from 'util';
import deepEqual from 'deep-eql';
import { diff } from 'jest-diff';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any[]) => any;

interface Call<Func extends AnyFunc> {
  input: Parameters<Func>;
}

type ExpectedCall<Func extends AnyFunc> =
  | ({ output: ReturnType<Func> } & Call<Func>)
  | ({ error: unknown } & Call<Func>);

interface ReturnHelpers<Func extends AnyFunc> {
  returns(output: ReturnType<Func>): void;
  throws(error: unknown): void;
}

interface AsyncReturnHelpers<Func extends AnyFunc> extends ReturnHelpers<Func> {
  resolves(output: Awaited<ReturnType<Func>>): void;
}

export class MockFunctionError extends Error {}

export interface MockFunction<Func extends AnyFunc> {
  (...input: Parameters<Func>): ReturnType<Func>;
  expectCallWith(
    ...input: Parameters<Func>
  ): ReturnType<Func> extends Promise<unknown>
    ? AsyncReturnHelpers<Func>
    : ReturnHelpers<Func>;
  reset(): void;
  assertComplete(): void;
}

interface MockFunctionState<Func extends AnyFunc> {
  expectedCalls: Array<ExpectedCall<Func>>;
  actualCalls: Array<Call<Func>>;
}

function formatFunctionCall(name: string, input: unknown[]): string {
  return `${name}(${input
    .map((arg) => inspect(arg, { depth: null }))
    .join(', ')})`;
}

function formatExpectedAndActualCalls(
  name: string,
  actualCall?: Call<AnyFunc>,
  expectedCall?: ExpectedCall<AnyFunc>
): string {
  const expectedStr = expectedCall
    ? formatFunctionCall(name, expectedCall.input)
    : '<none>';
  const actualStr = actualCall
    ? formatFunctionCall(name, actualCall.input)
    : '<none>';
  const diffStr =
    expectedCall &&
    actualCall &&
    !deepEqual(actualCall.input, expectedCall.input)
      ? diff(actualCall.input, expectedCall.input)
      : undefined;
  return [`Expected: ${expectedStr}`, `Actual: ${actualStr}`]
    .concat(diffStr ? [`Input diff: ${diffStr}`] : [])
    .join('\n');
}

/**
 * Creates a mock function, similar to jest.fn(), but with stricter rules to
 * help you avoid making unintentional mistakes.
 *
 * Example usage:
 *
 *  // Let's say we have a real function, add, that we want to mock
 *  function add(num1: number, num2: number): number {
 *    return num1 + num2;
 *  }
 *
 *  // We can create a mock function that behaves the same way
 *  const addMock = mockFunction<typeof add>('add');
 *  addMock.expectCallWith(1, 2).returns(3);
 *  addMock(1, 2); // -> returns 3
 *  addMock.expectCallWith(1, NaN).throws(new Error('Cant add NaN'));
 *  addMock(1, NaN); // -> throws Error('Cant add NaN')
 *
 *  // Unlike jest.fn(), mockFunction is strict...
 *
 *  // Each expected call can only be used once, in order
 *  addMock.expectCallWith(1, 2).returns(3);
 *  addMock(1, 2); // -> returns 3
 *  addMock(1, 2); // -> throws an error because we didn't expect this call
 *
 *  // The actual input must match the expected input
 *  addMock.expectCallWith(1, 2).returns(3);
 *  addMock(1, 3); // -> throws an error because the input doesn't match
 *
 *  // Every expected call must be used
 *  addMock.expectCallWith(1, 2).returns(3);
 *  addMock.assertComplete(); // -> throws an error because we didn't use the expected call
 *
 * Recommendations:
 * - Always call mockFunction.assertComplete() to ensure that all expected calls were used
 * - If you are going to reuse a mock between test cases, call mockFunction.reset() in afterEach
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function mockFunction<Func extends AnyFunc>(
  name: string
): MockFunction<Func> {
  const state: MockFunctionState<Func> = {
    expectedCalls: [],
    actualCalls: [],
  };

  const mock: MockFunction<Func> = (...input: Parameters<Func>) => {
    // Special case - [] and [undefined] are equivalent as args
    if (input.length === 1 && input[0] === undefined) {
      // eslint-disable-next-line no-param-reassign
      input = [] as unknown as Parameters<Func>;
    }
    state.actualCalls.push({ input });
    const expectedCall = state.expectedCalls[state.actualCalls.length - 1];
    if (!expectedCall) {
      const message = `Unexpected call to mock function: ${formatFunctionCall(
        name,
        input
      )}`;
      throw new MockFunctionError(message);
    }
    if (!deepEqual(input, expectedCall.input)) {
      const message = `Mismatched call to mock function:\n${formatExpectedAndActualCalls(
        name,
        { input },
        expectedCall
      )}`;
      throw new MockFunctionError(message);
    }

    if ('error' in expectedCall) {
      throw expectedCall.error;
    }
    return expectedCall.output;
  };

  mock.expectCallWith = (...input: Parameters<Func>) => {
    return {
      returns(output: ReturnType<Func>) {
        state.expectedCalls.push({ input, output });
      },
      throws(error: unknown) {
        state.expectedCalls.push({ input, error });
      },
      resolves(output: Awaited<ReturnType<Func>>) {
        state.expectedCalls.push({
          input,
          output: Promise.resolve(output) as ReturnType<Func>,
        });
      },
    };
  };

  mock.reset = () => {
    state.expectedCalls = [];
    state.actualCalls = [];
  };

  mock.assertComplete = () => {
    if (
      !deepEqual(
        state.actualCalls,
        state.expectedCalls.map(({ input }) => ({ input }))
      )
    ) {
      const numCalls = Math.max(
        state.actualCalls.length,
        state.expectedCalls.length
      );
      const message = `Mismatch between expected mock function calls and actual mock function calls:\n\n${[
        ...Array.from({ length: numCalls }).keys(),
      ]
        .map((index) => {
          const expectedCall = state.expectedCalls[index];
          const actualCall = state.actualCalls[index];
          return `Call #${index}\n${formatExpectedAndActualCalls(
            name,
            actualCall,
            expectedCall
          )}`;
        })
        .join('\n\n')}`;
      throw new MockFunctionError(message);
    }
  };

  return mock;
}
