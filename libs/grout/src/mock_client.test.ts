import { MockFunction } from '@votingworks/test-utils';
import { expectTypeOf } from 'expect-type';
import { createClient } from './client';
import { createMockClient } from './mock_client';
import { createApi } from './server';

const api = createApi({
  // eslint-disable-next-line @typescript-eslint/require-await
  async add(input: { num1: number; num2: number }): Promise<number> {
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
  // A mock client can pass as a real client
  expectTypeOf(mockClient).toMatchTypeOf(
    createClient<typeof api>({ baseUrl: '' })
  );
});

test('catches mock function errors and logs them', async () => {
  const mockClient = createMockClient<typeof api>();
  const consoleErrorMock = jest.fn();
  // eslint-disable-next-line no-console
  console.error = consoleErrorMock;
  await mockClient.add({ num1: 1, num2: 2 });
  expect(consoleErrorMock).toHaveBeenCalledTimes(1);
  expect(consoleErrorMock.mock.calls[0][0]).toMatchInlineSnapshot(
    `"Unexpected call to mock function: add({ num1: 1, num2: 2 })"`
  );
});

test('asserts complete for all methods', async () => {
  const mockClient = createMockClient<typeof api>();
  mockClient.add.expectCallWith({ num1: 1, num2: 2 }).resolves(42);
  mockClient.sqrt.expectCallWith({ num: 4 }).resolves(100);

  await expect(mockClient.add({ num1: 1, num2: 2 })).resolves.toEqual(42);

  expect(() => mockClient.assertComplete()).toThrowErrorMatchingInlineSnapshot(`
    "Mismatch between expected mock function calls and actual mock function calls:

    Call #0
    Expected: sqrt({ num: 4 })
    Actual: <none>
    "
  `);
});

test('resets all methods', () => {
  const mockClient = createMockClient<typeof api>();
  mockClient.add.expectCallWith({ num1: 1, num2: 2 }).resolves(42);
  mockClient.sqrt.expectCallWith({ num: 4 }).resolves(100);

  mockClient.reset();
  mockClient.assertComplete();
});
