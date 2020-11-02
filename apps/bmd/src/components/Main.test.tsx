import React from 'react'
import { render } from '@testing-library/react'

import Main, { MainChild } from './Main'

describe('renders Main', () => {
  it('with child', () => {
    const { container } = render(
      <Main>
        <MainChild>foo</MainChild>
      </Main>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('with centered content', () => {
    const { container } = render(
      <Main>
        <MainChild center>foo</MainChild>
      </Main>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('with not centered content', () => {
    const { container } = render(
      <Main noOverflow>
        <MainChild centerHorizontal={false}>foo</MainChild>
      </Main>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('with padding', () => {
    const { container } = render(
      <Main padded>
        <MainChild>padded</MainChild>
      </Main>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
