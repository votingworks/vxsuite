import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { Id } from '@votingworks/types';
import { RequestHandler, rest } from 'msw';

/**
 * Handlers for mocking API requests.
 */
export const handlers: readonly RequestHandler[] = [
  rest.get<never, { sheetId: Id; side: 'front' | 'back' }>(
    `/api/sheets/:sheetId/images/:side`,
    (req, res, ctx) => {
      const scannedPageFixture =
        req.params.side === 'front'
          ? electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront
          : electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack;
      return res(ctx.body(scannedPageFixture.asBuffer()));
    }
  ),
];
