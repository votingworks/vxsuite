import { unsafeParse } from '@votingworks/types';
import {
  GetWriteInsQueryParamsSchema,
  PostCvrFileQueryParamsSchema,
} from './endpoints';

test('PostCvrFileQueryParamsSchema', () => {
  expect(unsafeParse(PostCvrFileQueryParamsSchema, {})).toEqual({});
  expect(
    unsafeParse(PostCvrFileQueryParamsSchema, { analyzeOnly: 'true' })
  ).toEqual({ analyzeOnly: true });
  expect(
    unsafeParse(PostCvrFileQueryParamsSchema, { analyzeOnly: 'false' })
  ).toEqual({ analyzeOnly: false });
});

test('GetWriteInAdjudicationsQueryParamsSchema', () => {
  expect(unsafeParse(GetWriteInsQueryParamsSchema, {})).toEqual({});
  expect(unsafeParse(GetWriteInsQueryParamsSchema, { limit: '1' })).toEqual({
    limit: 1,
  });
});
