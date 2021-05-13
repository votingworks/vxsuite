import { safeParse } from '../'
import { ErrorsResponseSchema, OkResponseSchema } from './'

test('OkResponse', () => {
  safeParse(OkResponseSchema, { status: 'ok' }).unwrap()
  safeParse(OkResponseSchema, {}).unwrapErr()
})

test('ErrorsResponse', () => {
  safeParse(ErrorsResponseSchema, { status: 'error', errors: [] }).unwrap()
  safeParse(ErrorsResponseSchema, { status: 'ok' }).unwrapErr()
})
