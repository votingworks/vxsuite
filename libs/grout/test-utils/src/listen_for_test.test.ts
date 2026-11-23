import { afterEach, expect, test } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { buildRouter, createApi, createClient } from '@votingworks/grout';
import { listenForTest } from './listen_for_test.js';

let server: Server | undefined;

afterEach(() => {
  server?.close();
});

test('serves the app on a free port without keep-alive expiry', async () => {
  const api = createApi({
    echo(input: { value: string }): string {
      return input.value;
    },
  });
  const app = express();
  app.use('/api', buildRouter(api, express));

  const result = listenForTest(app);
  ({ server } = result);

  expect(result.port).toBeGreaterThan(0);
  expect(server.keepAliveTimeout).toEqual(0);
  const client = createClient<typeof api>({
    baseUrl: `http://localhost:${result.port}/api`,
  });
  expect(await client.echo({ value: 'hi' })).toEqual('hi');
});
