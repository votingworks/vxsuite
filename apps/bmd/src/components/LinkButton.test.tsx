import React from 'react'
import { StaticRouter } from 'react-router-dom'
import { fireEvent, render } from '@testing-library/react'

import LinkButton from './LinkButton'

it(`navigates to page`, () => {
  const { container } = render(
    <StaticRouter context={{}}>
      <LinkButton to="/">Go Home</LinkButton>
    </StaticRouter>
  )
  expect(container.firstChild).toMatchSnapshot()
})

it(`navigates back`, () => {
  const { container } = render(
    <StaticRouter context={{}}>
      <LinkButton goBack>Go Back</LinkButton>
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
