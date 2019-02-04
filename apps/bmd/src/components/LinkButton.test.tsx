import { axe } from 'jest-axe'
import React from 'react'
import { StaticRouter } from 'react-router'
import { fireEvent, render } from 'react-testing-library'

import LinkButton from './LinkButton'

it(`renders LinkButton`, () => {
  const { container } = render(
    <StaticRouter context={{}}>
      <LinkButton to="/">Push Me</LinkButton>
    </StaticRouter>
  )
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders LinkButton with onClick prop`, () => {
  const text = 'Push Me'
  const onClickHandler = jest.fn()
  const { getByText } = render(
    <StaticRouter context={{}}>
      <LinkButton to="/" onClick={onClickHandler}>
        {text}
      </LinkButton>
    </StaticRouter>
  )
  const button = getByText(text)
  fireEvent.click(button)
  expect(onClickHandler).toHaveBeenCalled()
  expect(button).toMatchSnapshot()
})

it(`renders LinkButton with onClick and disabled props`, () => {
  const text = 'Push Me'
  const onClickHandler = jest.fn()
  const { getByText } = render(
    <StaticRouter context={{}}>
      <LinkButton to="/" onClick={onClickHandler} disabled>
        {text}
      </LinkButton>
    </StaticRouter>
  )
  const button = getByText(text)
  fireEvent.click(button)
  expect(onClickHandler).not.toHaveBeenCalled()
  expect(button).toMatchSnapshot()
})

it(`LinkButton is accessible`, async () => {
  const { container } = render(
    <StaticRouter context={{}}>
      <LinkButton to="/">Push Me</LinkButton>
    </StaticRouter>
  )
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})
