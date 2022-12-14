import { mockFunction, MockFunction } from '@votingworks/test-utils';
import { AnyApi } from './server';

type MockMethods<Api extends AnyApi> = {
  [Method in keyof Api]: MockFunction<Api[Method]>;
};

interface MockHelpers {
  assertComplete(): void;
  reset(): void;
}

type MockClient<Api extends AnyApi> = MockMethods<Api> & MockHelpers;

/**
 * Creates a client with methods that are all mock functions.
 * (see @votingworks/test-utils/mockFunction)
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function createMockClient<Api extends AnyApi>(): MockClient<Api> {
  const mockMethods: Record<string, MockFunction<any>> = {};

  const mockHelpers: MockHelpers = {
    assertComplete(): void {
      for (const mockMethod of Object.values(mockMethods)) {
        mockMethod.assertComplete();
      }
    },

    reset(): void {
      for (const mockMethod of Object.values(mockMethods)) {
        mockMethod.reset();
      }
    },
  };

  return new Proxy(mockHelpers as MockClient<Api>, {
    get: (_target, methodName: string) => {
      if (methodName in mockHelpers) {
        return Reflect.get(mockHelpers, methodName);
      }
      mockMethods[methodName] ??= mockFunction(methodName);
      return mockMethods[methodName];
    },
  });
}
