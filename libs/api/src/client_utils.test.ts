import * as z from 'zod';
import fetchMock from 'fetch-mock';
import jestFetchMock from 'jest-fetch-mock';

import { ErrorsResponse, ErrorsResponseSchema, OkResponse } from './base';
import { fetchWithSchema } from './client_utils';

type TestResponse =
  | OkResponse<{
      foo: 'bar';
    }>
  | ErrorsResponse;

const TestSchema: z.ZodSchema<TestResponse> = z.union([
  z.object({
    status: z.literal('ok'),
    foo: z.literal('bar'),
  }),
  ErrorsResponseSchema,
]);

const OK_RESPONSE: TestResponse = {
  status: 'ok',
  foo: 'bar',
};

const OK_RESPONSE_STRING = JSON.stringify(OK_RESPONSE);

const ERROR_RESPONSE: TestResponse = {
  status: 'error',
  errors: [{ type: 'oops', message: 'my bad' }],
};

const ERROR_RESPONSE_STRING = JSON.stringify(ERROR_RESPONSE);

beforeEach(() => {
  jestFetchMock.enableMocks();
  fetchMock.reset();
  fetchMock.mock();
});

test('passes the URL through as-is to fetch', async () => {
  fetchMock.getOnce((url) => {
    expect(url).toEqual('/example');
    return true;
  }, OK_RESPONSE_STRING);

  expect(await fetchWithSchema(TestSchema, '/example')).toEqual(OK_RESPONSE);
});

test('adds "Accept: application/json" by default', async () => {
  fetchMock.getOnce((url, opts) => {
    expect(url).toEqual('/example');
    expect(opts.headers).toEqual({ Accept: 'application/json' });
    return true;
  }, OK_RESPONSE_STRING);

  expect(await fetchWithSchema(TestSchema, '/example')).toEqual(OK_RESPONSE);
});

test('allows overriding Accept header', async () => {
  fetchMock.getOnce((url, opts) => {
    expect(url).toEqual('/example');
    expect(opts.headers).toEqual({ Accept: 'x-custom-json' });
    return true;
  }, OK_RESPONSE_STRING);

  await fetchWithSchema(TestSchema, '/example', {
    headers: { Accept: 'x-custom-json' },
  });
});

test('preserves custom headers', async () => {
  fetchMock.getOnce((url, opts) => {
    expect(url).toEqual('/example');
    expect(opts.headers).toEqual(
      expect.objectContaining({ 'X-Custom': '123' })
    );
    return true;
  }, OK_RESPONSE_STRING);

  expect(
    await fetchWithSchema(TestSchema, '/example', {
      headers: { 'X-Custom': '123' },
    })
  ).toEqual(OK_RESPONSE);
});

test('returns parsed errors', async () => {
  fetchMock.getOnce('/example', { status: 400, body: ERROR_RESPONSE_STRING });

  expect(await fetchWithSchema(TestSchema, '/example')).toEqual(ERROR_RESPONSE);
});

test('throws on invalid JSON response', async () => {
  fetchMock.getOnce('/example', { status: 500, body: 'unknown server error' });

  await expect(fetchWithSchema(TestSchema, '/example')).rejects.toThrowError(
    "invalid JSON received: 'unknown server error' | status code: 500"
  );
});

test('throws if "ok" response fails schema validation ', async () => {
  fetchMock.getOnce(
    '/example',
    JSON.stringify({ status: 'ok', thisField: 'isInvalid' })
  );

  await expect(fetchWithSchema(TestSchema, '/example')).rejects.toThrowError(
    /invalid response received: .+ | status code: 200/
  );
});

test('throws if "error" response fails schema validation ', async () => {
  fetchMock.getOnce('/example', {
    status: 400,
    body: JSON.stringify({ status: 'error', thisField: 'isInvalid' }),
  });

  await expect(fetchWithSchema(TestSchema, '/example')).rejects.toThrowError(
    /invalid response received: .+ | status code: 400/
  );
});
