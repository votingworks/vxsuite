import { inspect } from 'node:util';
import { diff } from 'jest-diff';
import { assertDefined, deepEqual } from '@votingworks/basics';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any[]) => any;

interface Call<Func extends AnyFunc> {
  input: Parameters<Func>;
}

type ActualCall<Func extends AnyFunc> = Call<Func> & {
  matchingExpectedCallIndex?: number;
};

type ExpectedCall<Func extends AnyFunc> =
  | ({
      output: ReturnType<Func>;
      repeated: boolean;
      optional?: boolean;
    } & Call<Func>)
  | ({
      error: unknown;
      repeated: false;
      optional?: false;
    } & Call<Func>);

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
  expectRepeatedCallsWith(
    ...input: Parameters<Func>
  ): ReturnType<Func> extends Promise<unknown>
    ? Omit<AsyncReturnHelpers<Func>, 'throws'>
    : Omit<ReturnHelpers<Func>, 'throws'>;
  expectOptionalRepeatedCallsWith(
    ...input: Parameters<Func>
  ): ReturnType<Func> extends Promise<unknown>
    ? Omit<AsyncReturnHelpers<Func>, 'throws'>
    : Omit<ReturnHelpers<Func>, 'throws'>;
  reset(): void;
  assertComplete(): void;
}

interface MockFunctionState<Func extends AnyFunc> {
  expectedCalls: Array<ExpectedCall<Func>>;
  actualCalls: Array<ActualCall<Func>>;
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
    ? formatFunctionCall(name, expectedCall.input) +
      (expectedCall.repeated ? ' (repeated)' : '') +
      (expectedCall.optional ? ' (optional)' : '')
    : '<none>';
  const actualStr = actualCall
    ? formatFunctionCall(name, actualCall.input)
    : '<none>';
  const diffStr =
    expectedCall &&
    actualCall &&
    !deepEqual(actualCall.input, expectedCall.input)
      ? diff(expectedCall.input, actualCall.input)
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
 *  // You can also expect repeated calls, which is useful for functions that are polled
 *  addMock.expectedRepeatedCallsWith(1, 2).returns(3);
 *  addMock(1, 2); // -> returns 3
 *  addMock(1, 2); // -> returns 3
 *  addMock(1, 3); // -> throws an error because the input doesn't match
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

  // Find the next expected call that should be used for the given actual call.
  // We track which expected call each actual call matched and then base the
  // next appropriate expected call on that.
  function findExpectedCallForActualCallIndex(actualCallIndex: number) {
    const previousActualCall = state.actualCalls[actualCallIndex - 1];
    if (!previousActualCall) {
      return state.expectedCalls[0];
    }

    // If the previous actual call didn't match any expected call, then we don't
    // know what the next expected call should be.
    if (previousActualCall.matchingExpectedCallIndex === undefined) {
      throw new MockFunctionError(
        'Previous call to mock function did not match expected calls'
      );
    }

    // If we have a next expected call, use that
    const nextExpectedCallIndex =
      previousActualCall.matchingExpectedCallIndex + 1;
    if (nextExpectedCallIndex < state.expectedCalls.length) {
      return state.expectedCalls[nextExpectedCallIndex];
    }

    // Otherwise, maybe the previous expected call was a repeated expected call,
    // so we can use that
    const previousExpectedCall =
      state.expectedCalls[previousActualCall.matchingExpectedCallIndex];
    if (assertDefined(previousExpectedCall).repeated) {
      return previousExpectedCall;
    }

    return undefined;
  }

  const mock: MockFunction<Func> = (...input: Parameters<Func>) => {
    // Special case - [] and [undefined] are equivalent as args
    if (input.length === 1 && input[0] === undefined) {
      // eslint-disable-next-line no-param-reassign
      input = [] as unknown as Parameters<Func>;
    }

    const expectedCall = findExpectedCallForActualCallIndex(
      state.actualCalls.length
    );
    const callMatches = expectedCall && deepEqual(input, expectedCall.input);

    state.actualCalls.push({
      input,
      matchingExpectedCallIndex: callMatches
        ? state.expectedCalls.indexOf(expectedCall)
        : undefined,
    });

    if (!expectedCall) {
      const message = `Unexpected call to mock function: ${formatFunctionCall(
        name,
        input
      )}`;
      throw new MockFunctionError(message);
    }

    if (!callMatches) {
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

  mock.expectCallWith = (...input: Parameters<Func>) => ({
    returns(output: ReturnType<Func>) {
      state.expectedCalls.push({ input, output, repeated: false });
    },
    throws(error: unknown) {
      state.expectedCalls.push({ input, error, repeated: false });
    },
    resolves(output: Awaited<ReturnType<Func>>) {
      state.expectedCalls.push({
        input,
        output: Promise.resolve(output) as ReturnType<Func>,
        repeated: false,
      });
    },
  });

  mock.expectRepeatedCallsWith = (...input: Parameters<Func>) => ({
    returns(output: ReturnType<Func>) {
      state.expectedCalls.push({
        input,
        output,
        repeated: true,
      });
    },
    resolves(output: Awaited<ReturnType<Func>>) {
      state.expectedCalls.push({
        input,
        output: Promise.resolve(output) as ReturnType<Func>,
        repeated: true,
      });
    },
  });

  mock.expectOptionalRepeatedCallsWith = (...input: Parameters<Func>) => ({
    returns(output: ReturnType<Func>) {
      state.expectedCalls.push({
        input,
        output,
        repeated: true,
        optional: true,
      });
    },
    resolves(output: Awaited<ReturnType<Func>>) {
      state.expectedCalls.push({
        input,
        output: Promise.resolve(output) as ReturnType<Func>,
        repeated: true,
        optional: true,
      });
    },
  });

  mock.reset = () => {
    state.expectedCalls = [];
    state.actualCalls = [];
  };

  mock.assertComplete = () => {
    // We want to check:
    // - Every actual call matched an expected call
    // - Every expected call was used
    // So we build a correspondence of actual calls with their expected calls.

    const actualCallsWithTheirExpectedCalls = state.actualCalls.map(
      (actualCall, actualCallIndex) => {
        const expectedCall =
          findExpectedCallForActualCallIndex(actualCallIndex);
        return {
          actualCall,
          expectedCall,
        };
      }
    );

    const unusedExpectedCalls = state.expectedCalls.filter(
      (expectedCall) =>
        !expectedCall.optional &&
        !actualCallsWithTheirExpectedCalls.some(
          ({ expectedCall: usedExpectedCall }) =>
            usedExpectedCall === expectedCall
        )
    );

    const callCorrespondence = [
      ...actualCallsWithTheirExpectedCalls,
      ...unusedExpectedCalls.map((expectedCall) => ({
        actualCall: undefined,
        expectedCall,
      })),
    ];

    // We can only accurately report a correspondence of expected and actual
    // calls up to the first mismatched call. After that, we don't know which
    // expected calls were used for which actual calls.
    const firstMismatchedCallIndex = callCorrespondence.findIndex(
      ({ actualCall, expectedCall }) =>
        !(
          actualCall &&
          expectedCall &&
          actualCall.matchingExpectedCallIndex !== undefined
        )
    );

    if (firstMismatchedCallIndex !== -1) {
      const message = `Mismatch between expected mock function calls and actual mock function calls:\n\n${callCorrespondence
        .slice(0, firstMismatchedCallIndex + 1)
        .map(
          ({ actualCall, expectedCall }, index) =>
            `Call #${index}\n${formatExpectedAndActualCalls(
              name,
              actualCall,
              expectedCall
            )}`
        )
        .join('\n\n')}`;
      throw new MockFunctionError(message);
    }
  };

  return mock;
}
