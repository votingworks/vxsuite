import { safeParse } from '..'
import { ErrorsResponseSchema, OkResponseSchema } from '.'

test('OkResponse', () => {
  safeParse(OkResponseSchema, { status: 'ok' }).unsafeUnwrap()
  safeParse(OkResponseSchema, {}).unsafeUnwrapErr()
})

test('ErrorsResponse', () => {
  safeParse(ErrorsResponseSchema, {
    status: 'error',
    errors: [],
  }).unsafeUnwrap()
  safeParse(ErrorsResponseSchema, { status: 'ok' }).unsafeUnwrapErr()
})
