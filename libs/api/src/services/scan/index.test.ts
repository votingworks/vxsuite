import { safeParse } from '@votingworks/types';
import { GetPrecinctSelectionConfigResponseSchema } from '.';

test('sanity check', () => {
  safeParse(GetPrecinctSelectionConfigResponseSchema, {
    status: 'ok',
    precinctId: 'abc',
  }).unsafeUnwrap();
});
