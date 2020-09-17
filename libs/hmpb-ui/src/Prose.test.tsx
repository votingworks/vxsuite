import { cleanup, render } from '@testing-library/react'
import * as faker from 'faker'
import React from 'react'
import { Prose } from './Prose'

const optionalBoolean = () =>
  faker.random.arrayElement([true, false, undefined] as const)

test('rendering with default props works', () => {
  expect(render(<Prose>Words, words, words.</Prose>).container)
    .toMatchInlineSnapshot(`
    <div>
      <div
        class="sc-AxjAm hxlhWG"
      >
        Words, words, words.
      </div>
    </div>
  `)
})

test('always renders the child text regardless of props', () => {
  for (let i = 0; i < 100; i++) {
    render(
      <Prose
        compact={optionalBoolean()}
        maxWidth={optionalBoolean()}
        textCenter={optionalBoolean()}
      >
        Words, words, words.
      </Prose>
    ).getByText('Words, words, words.')

    cleanup()
  }
})
