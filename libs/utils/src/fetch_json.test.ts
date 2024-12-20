import { beforeEach, expect, test } from 'vitest';
import fetchMock from 'fetch-mock';
import { fetchJson } from './fetch_json';

beforeEach(() => {
  fetchMock.restore();
});

test('passes the URL through as-is to fetch', async () => {
  fetchMock.getOnce((url) => {
    expect(url).toEqual('/example');
    return true;
  }, {});

  await fetchJson('/example');
});

test('adds "Accept: application/json" by default', async () => {
  fetchMock.getOnce((url, opts) => {
    expect(url).toEqual('/example');
    expect(opts.headers).toEqual({ Accept: 'application/json' });
    return true;
  }, {});

  await fetchJson('/example');
});

test('allows overriding Accept header', async () => {
  fetchMock.getOnce((url, opts) => {
    expect(url).toEqual('/example');
    expect(opts.headers).toEqual({ Accept: 'x-custom-json' });
    return true;
  }, {});

  await fetchJson('/example', { headers: { Accept: 'x-custom-json' } });
});

test('preserves custom headers', async () => {
  fetchMock.getOnce((url, opts) => {
    expect(url).toEqual('/example');
    expect(opts.headers).toEqual(
      expect.objectContaining({ 'X-Custom': '123' })
    );
    return true;
  }, {});

  await fetchJson('/example', { headers: { 'X-Custom': '123' } });
});

test('throws on non-ok response', async () => {
  fetchMock.getOnce('/example', { status: 400 });
  await expect(fetchJson('/example')).rejects.toThrowError(
    'Received 400 status code'
  );
});

test('interprets the response as JSON', async () => {
  fetchMock.getOnce('/example', '{ "status": "ok" }');
  expect(await fetchJson('/example')).toEqual({ status: 'ok' });
});
