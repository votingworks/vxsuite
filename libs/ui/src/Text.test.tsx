import { render } from '@testing-library/react'

import { Text, TextWithLineBreaks } from './Text'

describe('renders Text', () => {
  test('as paragraph tag', async () => {
    const text = 'paragraph'
    const { getByText } = render(<Text>{text}</Text>)
    const element = getByText(text)
    expect(element.tagName).toEqual('P')
    expect(element).toMatchSnapshot()
  })

  test('center muted', async () => {
    const { container } = render(
      <Text center muted>
        center muted?
      </Text>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  test('displays error style', async () => {
    const { container } = render(<Text error>Error Text?</Text>)
    expect(container.firstChild).toMatchSnapshot()
  })

  test('narrow wordBreak warning', async () => {
    const { container } = render(
      <Text narrow wordBreak warning>
        narrow wordBreak
      </Text>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  test('vote icon', async () => {
    const { container } = render(<Text voteIcon>vote!</Text>)
    expect(container.firstChild).toMatchSnapshot()
  })

  test('warning icon', async () => {
    const { container } = render(<Text warningIcon>Warning</Text>)
    expect(container.firstChild).toMatchSnapshot()
  })

  test('align left preLine normal italic', async () => {
    const { container } = render(
      <Text left preLine normal italic>
        align left preLine
      </Text>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  test('align right nowrap light', async () => {
    const { container } = render(
      <Text right noWrap light>
        align right nowrap
      </Text>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  test('small white bold', async () => {
    const { container } = render(
      <Text small white bold>
        small white bold
      </Text>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  test('converts line-breaks into <p> and <br/> tags', () => {
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
})
