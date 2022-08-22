import { MockScannerClient } from '@votingworks/plustek-sdk';
import { safeParse } from '@votingworks/types';
import express, { Application } from 'express';
import * as z from 'zod';

const PutMockRequestSchema = z.object({
  files: z.tuple([z.string(), z.string()]),
});

export function plustekMockServer(client: MockScannerClient): Application {
  return express()
    .use(express.raw())
    .use(express.json({ limit: '5mb', type: 'application/json' }))
    .use(express.urlencoded({ extended: false }))
    .put('/mock', async (request, response) => {
      const bodyParseResult = safeParse(PutMockRequestSchema, request.body);

      if (bodyParseResult.isErr()) {
        response
          .status(400)
          .json({ status: 'error', error: `${bodyParseResult.err()}` });
        return;
      }

      const simulateResult = await client.simulateLoadSheet(
        bodyParseResult.ok().files
      );

      if (simulateResult.isErr()) {
        response
          .status(400)
          .json({ status: 'error', error: `${simulateResult.err()}` });
        return;
      }

      response.json({ status: 'ok' });
    })
    .delete('/mock', async (_request, response) => {
      const simulateResult = await client.simulateRemoveSheet();

      if (simulateResult.isErr()) {
        response
          .status(400)
          .json({ status: 'error', error: `${simulateResult.err()}` });
        return;
      }

      response.json({ status: 'ok' });
    });
}
