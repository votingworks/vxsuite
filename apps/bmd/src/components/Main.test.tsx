import { axe } from 'jest-axe'
import React from 'react'
import { render } from 'react-testing-library'

import Main, { MainChild } from './Main'

it(`renders Main with child`, async () => {
  const { container } = render(
    <Main>
      <MainChild>foo</MainChild>
    </Main>
  )
  expect(await axe(container.innerHTML)).toHaveNoViolations()
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders centered content`, async () => {
  const { container } = render(
    <Main>
      <MainChild center>foo</MainChild>
    </Main>
  )
  expect(await axe(container.innerHTML)).toHaveNoViolations()
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders not centered content`, async () => {
  const { container } = render(
    <Main>
      <MainChild centerHorizontal={false}>foo</MainChild>
    </Main>
  )
  expect(await axe(container.innerHTML)).toHaveNoViolations()
  expect(container.firstChild).toMatchSnapshot()
})
