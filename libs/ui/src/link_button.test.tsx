import { Router, StaticRouter } from 'react-router-dom';
import { createMemoryHistory } from 'history';

import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '../test/react_testing_library';
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

test('renders LinkButton with onClick and disabled props', () => {
  const text = 'Push Me';
  const history = createMemoryHistory();
  history.push('/somewhere');
  render(
    <StaticRouter context={{}}>
      <LinkButton to="/" disabled>
        {text}
      </LinkButton>
    </StaticRouter>
  );

  expect(history.location.pathname).toEqual('/somewhere');
  const button = screen.getByText(text);
  fireEvent.click(button);
  expect(history.location.pathname).toEqual('/somewhere');
});
