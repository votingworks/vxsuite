import React from 'react'
import { render, cleanup } from '@testing-library/react'
import * as faker from 'faker'
import { inspect } from 'util'
import { Text, TextProps, TextWithLineBreaks } from './Text'

const optionalBoolean = () =>
  faker.random.arrayElement([true, false, undefined] as const)
const pickOne = <T extends unknown>(...args: T[]) =>
  faker.random.arrayElement<T>(args)

test('rendering Text with defaults works', () => {
  expect(render(<Text>Hello World</Text>).container).toMatchInlineSnapshot(`
    <div>
      <p
        class="sc-AxjAm iwGlUD"
      >
        Hello World
      </p>
    </div>
  `)
})

test('always renders the child text regardless of props', () => {
  for (let i = 0; i < 100; i++) {
    const textProps: TextProps = {
      [pickOne('center', 'right', 'left')]: optionalBoolean(),
      [pickOne('error', 'muted', 'warning')]: optionalBoolean(),
      [pickOne('warningIcon', 'voteIcon')]: optionalBoolean(),
      [pickOne('bold', 'light', 'normal')]: optionalBoolean(),
      [pickOne('noWrap', 'preLine')]: optionalBoolean(),
      italic: optionalBoolean(),
      narrow: optionalBoolean(),
      small: optionalBoolean(),
      wordBreak: optionalBoolean(),
    }

    const child = render(<Text {...textProps}>Hello World</Text>).queryByText(
      'Hello World'
    )

    if (!child) {
      throw new Error(
        `Rendering <Text> failed to include its child text when rendered with props: ${inspect(
          textProps
        )}`
      )
    }

    cleanup()
  }
})

test('TextWithLineBreaks renders two sequential newlines as paragraph separators', () => {
  expect(render(<TextWithLineBreaks text={'a\n\nb'} />).container)
    .toMatchInlineSnapshot(`
    <div>
      <p>
        a
      </p>
      <p>
        b
      </p>
    </div>
  `)
})

test('TextWithLineBreaks renders newlines as break separators', () => {
  expect(render(<TextWithLineBreaks text={'a\nb'} />).container)
    .toMatchInlineSnapshot(`
    <div>
      <p>
        a
        <br />
        b
      </p>
    </div>
  `)
})
