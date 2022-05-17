import { safeParse } from '@votingworks/types';
import { GetCurrentPrecinctResponseSchema } from '.';

test('sanity check', () => {
  safeParse(GetCurrentPrecinctResponseSchema, {
    status: 'ok',
    precinctId: 'abc',
  }).unsafeUnwrap();
});
