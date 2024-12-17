import {
  mockFunction,
  MockFunction,
  MockFunctionError,
} from '@votingworks/test-utils';
import {
  AnyApi,
  AnyMethods,
  AsyncRpcMethod,
  inferApiMethods,
} from '@votingworks/grout';

type MockMethods<Methods extends AnyMethods> = {
  [Method in keyof Methods]: MockFunction<AsyncRpcMethod<Methods[Method]>>;
};

interface MockHelpers {
  assertComplete(): void;
}

/**
 * A mock Grout client with methods that are all MockFunctions.
 */
export type MockClient<Api extends AnyApi> = MockMethods<inferApiMethods<Api>> &
  MockHelpers;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMockFunction = MockFunction<any>;

function createSafeMockMethod(methodName: string): AnyMockFunction {
  // API methods are sometimes called without exception handling, which can
  // cause cause tests to exit early and swallow the error. So we wrap the mock
  // method in a proxy that catches any exceptions and logs them to the console
  // instead.
  return new Proxy(mockFunction(methodName), {
    apply: (target, thisArg, args) => {
      try {
        return Reflect.apply(target, thisArg, args);
      } catch (error) {
        if (error instanceof MockFunctionError) {
          // eslint-disable-next-line no-console
          console.error(error.message);
          // Return a best guess at a dummy value that won't cause exceptions
          // in the consuming code.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return {} as unknown as any;
        }
        throw error;
      }
    },
  });
}

/**
 * Creates a client with methods that are all mock functions.
 * (see @votingworks/test-utils/mockFunction)
 *
 * Pass `catchUnexpectedErrors: true` to catch errors in mock methods (e.g. an unexpected
 * call) and return a dummy value. This can be useful to avoid difficult to
 * debug test crashes if you are working with legacy code that has no error
 * handling.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function createMockClient<Api extends AnyApi>(options?: {
  catchUnexpectedErrors: boolean;
}): MockClient<Api> {
  const mockMethods: Record<string, AnyMockFunction> = {};

  const mockHelpers: MockHelpers = {
    assertComplete(): void {
      for (const mockMethod of Object.values(mockMethods)) {
        mockMethod.assertComplete();
      }
    },
  };

  // Similar to how we build the real client, we use a Proxy to simulate having
  // all the methods of the API, dynamically creating mock functions as needed
  // and storing them in mockMethods.
  return new Proxy(mockHelpers as MockClient<Api>, {
    get: (_target, methodName: string) => {
      // Bypass for special mock client helper methods
      if (methodName in mockHelpers) {
        return Reflect.get(mockHelpers, methodName);
      }

      mockMethods[methodName] ??= options?.catchUnexpectedErrors
        ? createSafeMockMethod(methodName)
        : mockFunction(methodName);
      return mockMethods[methodName];
    },
  });
}
