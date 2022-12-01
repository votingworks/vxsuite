import React from 'react';
import { Router, StaticRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import userEvent from '@testing-library/user-event';
import { LinkButton } from './link_button';

test('navigates to page', () => {
  const history = createMemoryHistory();
  render(
    <Router history={history}>
      <LinkButton to="/somewhere">Go Somewhere</LinkButton>
    </Router>
  );
  expect(history.location.pathname).toEqual('/');
  userEvent.click(screen.getByText('Go Somewhere'));
  expect(history.location.pathname).toEqual('/somewhere');
});

test('navigates back', () => {
  const history = createMemoryHistory();
  history.push('/somewhere');
  render(
    <Router history={history}>
      <LinkButton goBack>Go Back</LinkButton>
    </Router>
  );
  expect(history.location.pathname).toEqual('/somewhere');
  userEvent.click(screen.getByText('Go Back'));
  expect(history.location.pathname).toEqual('/');
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
