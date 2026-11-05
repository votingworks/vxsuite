import { beforeEach, expect, test, vi } from 'vitest';
import { fetchJson } from './fetch_json.js';

function mockFetchResponse(response: Response) {
  const fetchFn = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

let fetchFn: ReturnType<typeof mockFetchResponse>;

beforeEach(() => {
  fetchFn = mockFetchResponse(new Response('{}'));
});

test('passes the URL through as-is to fetch', async () => {
  await fetchJson('/example');
  expect(fetchFn).toHaveBeenCalledWith('/example', expect.anything());
});

test('adds "Accept: application/json" by default', async () => {
  await fetchJson('/example');
  expect(fetchFn).toHaveBeenCalledWith('/example', {
    headers: { Accept: 'application/json' },
  });
});

test('allows overriding Accept header', async () => {
  await fetchJson('/example', { headers: { Accept: 'x-custom-json' } });
  expect(fetchFn).toHaveBeenCalledWith('/example', {
    headers: { Accept: 'x-custom-json' },
  });
});

test('preserves custom headers', async () => {
  await fetchJson('/example', { headers: { 'X-Custom': '123' } });
  expect(fetchFn).toHaveBeenCalledWith('/example', {
    headers: expect.objectContaining({ 'X-Custom': '123' }),
  });
});

test('throws on non-ok response', async () => {
  mockFetchResponse(new Response(null, { status: 400 }));
  await expect(fetchJson('/example')).rejects.toThrowError(
    'Received 400 status code'
  );
});

test('interprets the response as JSON', async () => {
  mockFetchResponse(new Response('{ "status": "ok" }'));
  expect(await fetchJson('/example')).toEqual({ status: 'ok' });
});
