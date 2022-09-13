import { unsafeParse } from '@votingworks/types';
import {
  GetWriteInAdjudicationsQueryParamsSchema,
  PostCvrFileQueryParamsSchema,
} from '.';

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
  expect(unsafeParse(GetWriteInAdjudicationsQueryParamsSchema, {})).toEqual({});
  expect(
    unsafeParse(GetWriteInAdjudicationsQueryParamsSchema, { limit: '1' })
  ).toEqual({ limit: 1 });
});
