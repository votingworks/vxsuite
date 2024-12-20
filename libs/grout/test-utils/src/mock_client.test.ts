import { expect, test, vi } from 'vitest';
import { MockFunction } from '@votingworks/test-utils';
import { expectTypeOf } from 'expect-type';
import { createApi, createClient } from '@votingworks/grout';
import { createMockClient } from './mock_client';

const api = createApi({
  add(input: { num1: number; num2: number }): number {
    return input.num1 + input.num2;
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async sqrt(input: { num: number }): Promise<number> {
    return Math.sqrt(input.num);
  },
});

test('creates a mock client', () => {
  const mockClient = createMockClient<typeof api>();
  // A mock client has a mock function for each method
  expectTypeOf(mockClient.add).toEqualTypeOf<
    MockFunction<(input: { num1: number; num2: number }) => Promise<number>>
  >();
  expectTypeOf(mockClient.sqrt).toEqualTypeOf<
    MockFunction<(input: { num: number }) => Promise<number>>
  >();
  // A mock client can pass as a real client
  expectTypeOf(mockClient).toMatchTypeOf(
    createClient<typeof api>({ baseUrl: '' })
  );
});

test('catches exceptions from mock function failures and logs them', async () => {
  const mockClient = createMockClient<typeof api>({
    catchUnexpectedErrors: true,
  });
  const consoleErrorMock = vi.fn();
  // eslint-disable-next-line no-console
  console.error = consoleErrorMock;
  await mockClient.add({ num1: 1, num2: 2 });
  expect(consoleErrorMock).toHaveBeenCalledTimes(1);
  expect(consoleErrorMock.mock.calls[0]![0]).toMatchInlineSnapshot(
    `"Unexpected call to mock function: add({ num1: 1, num2: 2 })"`
  );
});

test('doesnt catch intentional exceptions from mock functions', () => {
  const mockClient = createMockClient<typeof api>({
    catchUnexpectedErrors: true,
  });
  const consoleErrorMock = vi.fn();
  // eslint-disable-next-line no-console
  console.error = consoleErrorMock;
  mockClient.add
    .expectCallWith({ num1: 1, num2: 2 })
    .throws(new Error('intentional error'));
  expect(() => mockClient.add({ num1: 1, num2: 2 })).toThrowError(
    'intentional error'
  );
  expect(consoleErrorMock).not.toHaveBeenCalled();
});

test('asserts complete for all methods', async () => {
  const mockClient = createMockClient<typeof api>();
  mockClient.add.expectCallWith({ num1: 1, num2: 2 }).resolves(42);
  mockClient.sqrt.expectCallWith({ num: 4 }).resolves(100);

  await expect(mockClient.add({ num1: 1, num2: 2 })).resolves.toEqual(42);

  expect(() => mockClient.assertComplete()).toThrowErrorMatchingInlineSnapshot(`
    [Error: Mismatch between expected mock function calls and actual mock function calls:

    Call #0
    Expected: sqrt({ num: 4 })
    Actual: <none>]
  `);
});
