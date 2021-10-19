import React from 'react';
import { StaticRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import LinkButton from './LinkButton';

test('navigates to page', () => {
  const { container } = render(
    <StaticRouter context={{}}>
      <LinkButton to="/">Go Home</LinkButton>
    </StaticRouter>
  );
  expect(container.firstChild).toMatchSnapshot();
});

test('navigates back', () => {
  const { container } = render(
    <StaticRouter context={{}}>
      <LinkButton goBack>Go Back</LinkButton>
    </StaticRouter>
  );
  expect(container.firstChild).toMatchSnapshot();
});

test('renders LinkButton with onClick prop', () => {
  const text = 'Push Me';
  const onClickHandler = jest.fn();
  render(
    <StaticRouter context={{}}>
      <LinkButton to="/" onPress={onClickHandler}>
        {text}
      </LinkButton>
    </StaticRouter>
  );
  const button = screen.getByText(text);
  fireEvent.click(button);
  expect(onClickHandler).toHaveBeenCalled();
  expect(button).toMatchSnapshot();
});

test('renders LinkButton with onClick and disabled props', () => {
  const text = 'Push Me';
  const onClickHandler = jest.fn();
  render(
    <StaticRouter context={{}}>
      <LinkButton to="/" onClick={onClickHandler} disabled>
        {text}
      </LinkButton>
    </StaticRouter>
  );
  const button = screen.getByText(text);
  fireEvent.click(button);
  expect(onClickHandler).not.toHaveBeenCalled();
  expect(button).toMatchSnapshot();
});
