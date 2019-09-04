import React from 'react'
import { render } from '@testing-library/react'

import Text, { TextWithLineBreaks } from './Text'

it('outputs paragraph tag', async () => {
  const text = 'paragraph'
  const { getByText } = render(<Text>{text}</Text>)
  const element = getByText(text)
  expect(element.tagName).toEqual('P')
  expect(element).toMatchSnapshot()
})

it('outputs "span" tag specified by "as" prop', async () => {
  const text = 'Text in a span?'
  const { getByText } = render(<Text as="span">{text}</Text>)
  const element = getByText(text)
  expect(element.tagName).toEqual('SPAN')
  expect(element).toMatchSnapshot()
})

it('centers centered style', async () => {
  const { container } = render(<Text center>Centered Text?</Text>)
  expect(container.firstChild).toMatchSnapshot()
})

it('displays muted style', async () => {
  const { container } = render(<Text muted>Muted Text?</Text>)
  expect(container.firstChild).toMatchSnapshot()
})

it('displays error style', async () => {
  const { container } = render(<Text error>Error Text?</Text>)
  expect(container.firstChild).toMatchSnapshot()
})

it('converts line-breaks into <p> and <br/> tags', () => {
  const { container } = render(
    <TextWithLineBreaks
      text={'I’m a paragraph.\n\nAnd I’m a paragraph with a\nline break.'}
    />
  )
  expect(container).toMatchInlineSnapshot(`
<div>
  <p>
    I’m a paragraph.
  </p>
  <p>
    And I’m a paragraph with a
    <br />
    line break.
  </p>
</div>
`)
})
