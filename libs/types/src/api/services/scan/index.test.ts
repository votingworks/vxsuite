import { GetCurrentPrecinctResponseSchema } from '.';
import { safeParse } from '../../../generic';

test('sanity check', () => {
  safeParse(GetCurrentPrecinctResponseSchema, {
    status: 'ok',
    precinctId: 'abc',
  }).unsafeUnwrap();
});
